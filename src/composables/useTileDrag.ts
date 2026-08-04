import { nextTick, onScopeDispose, ref, shallowRef } from "vue";
import { hitTest, type GridMetrics } from "@/lib/grid-geometry";

/**
 * Drag-to-reorder, built on Pointer Events rather than a library.
 *
 * The grid is uniform and we already own the geometry maths for arrow-key
 * navigation, so the useful part of a sortable library is the part we do not
 * need. What we *do* need is unusual — the first drag has to switch the whole
 * app into rename mode — and that trigger is exactly what a generic library
 * makes awkward.
 *
 * Pointer Events unify mouse, touch and pen, so there is one code path.
 */

/** Movement before a press becomes a drag. Below this, it is still a click. */
const DRAG_THRESHOLD = 6;

/** How close to the container edge auto-scrolling kicks in. */
const EDGE_SIZE = 72;
const MAX_SCROLL_SPEED = 18;

export interface TileDragOptions {
  /** The scrolling element the grid lives in. */
  scroller: () => HTMLElement | null;
  /**
   * The grid's laid-out height. Auto-scroll cannot trust `scrollHeight`: the
   * lifted card is transformed, and a transformed box still counts towards the
   * scroller's scrollable overflow. Dragging to the bottom edge would then
   * scroll, which moves the card further down the document, which makes more
   * room to scroll — a loop that runs off the end of the last row into blank
   * space. Layout height is the one number the transform cannot inflate.
   */
  contentHeight: () => number;
  /** Number of tiles currently rendered. */
  count: () => number;
  metrics: () => GridMetrics;
  /** Grid content-box origin, in viewport coordinates. */
  gridOrigin: () => { x: number; y: number };
  /**
   * Called once when a press turns into a drag. Enters rename mode.
   *
   * May return a corrected index: dragging a multi-tile selection gathers it
   * into a contiguous block first, which moves the pressed tile out from under
   * the index it was pressed at.
   */
  onBegin: (index: number) => number | void | Promise<number | void>;
  /**
   * Called whenever the dragged tile should change position. Returns the index
   * the tile actually took, which is not the one asked for when a block of
   * several has been clamped against the end of the list.
   */
  onMove: (from: number, to: number) => number | void;
  onEnd?: () => void;
  /** Called if the drag is abandoned with Escape. */
  onCancel?: () => void;
}

export function useTileDrag(options: TileDragOptions) {
  /**
   * Index being dragged, or -1. Doubles as the drop index: the tile is moved
   * through the list as the pointer crosses cells, so the cell it currently
   * sits in is the one it would land in, and that cell is what the tile draws
   * as its placeholder.
   */
  const draggingIndex = ref(-1);
  /** Offset of the lifted card from its cell. Applied inside the tile, not to it. */
  const translate = ref({ x: 0, y: 0 });
  /**
   * True only once the press has crossed the threshold and become a drag. A ref
   * rather than a plain flag because the template styles the lifted tile off it.
   */
  const dragging = ref(false);

  const element = shallowRef<HTMLElement | null>(null);
  let pointerId = -1;
  let origin = { x: 0, y: 0 };
  let grabOffset = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0 };
  let frame = 0;

  function onPointerDown(event: PointerEvent, index: number): void {
    // Left button / primary contact only; a right-click is a context menu.
    if (event.button !== 0) return;

    const tile = event.currentTarget as HTMLElement;
    element.value = tile;
    pointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    pointer = { ...origin };
    dragging.value = false;
    draggingIndex.value = index;

    const rect = tile.getBoundingClientRect();
    grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown, true);
  }

  async function onPointerMove(event: PointerEvent): Promise<void> {
    if (event.pointerId !== pointerId) return;
    pointer = { x: event.clientX, y: event.clientY };

    if (!dragging.value) {
      const travelled = Math.hypot(pointer.x - origin.x, pointer.y - origin.y);
      if (travelled < DRAG_THRESHOLD) return;

      dragging.value = true;
      // Capture so the drag survives the pointer leaving the tile — which it
      // does immediately, because the tile moves out from under it.
      element.value?.setPointerCapture(pointerId);
      const corrected = await options.onBegin(draggingIndex.value);
      if (typeof corrected === "number") draggingIndex.value = corrected;
      schedule();
      return;
    }

    event.preventDefault();
    schedule();
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (dragging.value) update();
    });
  }

  function update(): void {
    const tile = element.value;
    if (!tile) return;

    // Scroll first: it moves the cell under the card, and measuring before it
    // would leave the card a frame behind — which, while auto-scroll runs every
    // frame, reads as the card trailing the cursor by the whole scroll speed.
    autoScroll();
    follow();

    const origin = options.gridOrigin();
    const target = hitTest(
      { x: pointer.x - origin.x, y: pointer.y - origin.y },
      options.metrics(),
      options.count(),
    );

    if (target >= 0 && target !== draggingIndex.value) {
      const landed = options.onMove(draggingIndex.value, target);
      draggingIndex.value = typeof landed === "number" ? landed : target;
      // The tile only reaches its new cell when Vue flushes, which is after this
      // frame has computed the offset. Re-measure on the far side of that flush,
      // still before the paint, or the card is drawn a cell out of place for the
      // frame the reorder lands on.
      void nextTick(follow);
    }
  }

  /** Put the card back under the cursor, wherever its cell has ended up. */
  function follow(): void {
    const tile = element.value;
    if (!tile) return;

    // The tile stays in its cell as the drop placeholder and only the card
    // inside it is offset, so this rect is the laid-out position as read.
    const rect = tile.getBoundingClientRect();
    translate.value = {
      x: pointer.x - grabOffset.x - rect.left,
      y: pointer.y - grabOffset.y - rect.top,
    };
  }

  function autoScroll(): void {
    const scroller = options.scroller();
    if (!scroller) return;

    const bounds = scroller.getBoundingClientRect();
    const above = pointer.y - bounds.top;
    const below = bounds.bottom - pointer.y;

    let delta = 0;
    if (above < EDGE_SIZE) delta = -speedFor(EDGE_SIZE - above);
    else if (below < EDGE_SIZE) delta = speedFor(EDGE_SIZE - below);

    if (delta === 0) return;

    const limit = Math.max(0, options.contentHeight() - scroller.clientHeight);
    const next = Math.min(Math.max(scroller.scrollTop + delta, 0), limit);
    if (next === scroller.scrollTop) return;

    scroller.scrollTop = next;
    // Keep the loop alive while hovering the edge, even if the pointer is
    // perfectly still — otherwise scrolling stalls the moment you stop moving.
    schedule();
  }

  function speedFor(depth: number): number {
    return Math.ceil((Math.min(depth, EDGE_SIZE) / EDGE_SIZE) * MAX_SCROLL_SPEED);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !dragging.value) return;
    event.preventDefault();
    event.stopPropagation();
    options.onCancel?.();
    stop();
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    if (dragging.value) options.onEnd?.();
    stop();
  }

  /**
   * A pointerup that ends a drag still dispatches a `click`, retargeted by the
   * pointer capture onto the cell — which the grid would read as a click that
   * missed every photo, and clear the selection you just dragged. Swallow
   * exactly one, and only after a press that really became a drag.
   */
  function swallowNextClick(): void {
    const listener = (event: MouseEvent) => {
      event.stopPropagation();
      disarm();
    };
    const disarm = () => {
      clearTimeout(timer);
      window.removeEventListener("click", listener, true);
    };
    // No click arrives at all if the pointer came up outside the window.
    const timer = setTimeout(disarm, 0);
    window.addEventListener("click", listener, true);
  }

  function stop(): void {
    if (dragging.value) swallowNextClick();

    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (pointerId !== -1 && element.value?.hasPointerCapture(pointerId)) {
      element.value.releasePointerCapture(pointerId);
    }

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKeyDown, true);

    dragging.value = false;
    pointerId = -1;
    element.value = null;
    draggingIndex.value = -1;
    translate.value = { x: 0, y: 0 };
  }

  onScopeDispose(stop);

  return {
    draggingIndex,
    translate,
    /** True once the press has actually become a drag, not merely a click. */
    dragging,
    onPointerDown,
    cancel: () => {
      options.onCancel?.();
      stop();
    },
  };
}
