import { onScopeDispose, ref, shallowRef } from "vue";
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
  /** Number of tiles currently rendered. */
  count: () => number;
  metrics: () => GridMetrics;
  /** Grid content-box origin, in viewport coordinates. */
  gridOrigin: () => { x: number; y: number };
  /** Called once when a press turns into a drag. Enters rename mode. */
  onBegin: (index: number) => void | Promise<void>;
  /** Called whenever the dragged tile should change position. */
  onMove: (from: number, to: number) => void;
  onEnd?: () => void;
  /** Called if the drag is abandoned with Escape. */
  onCancel?: () => void;
}

export function useTileDrag(options: TileDragOptions) {
  /** Index being dragged, or -1. Drives the tile's lifted styling. */
  const draggingIndex = ref(-1);
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
      await options.onBegin(draggingIndex.value);
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

    // Read the tile's laid-out position by subtracting the transform we applied,
    // so this self-corrects after a reorder moves the tile to a new cell.
    const rect = tile.getBoundingClientRect();
    const layout = { x: rect.left - translate.value.x, y: rect.top - translate.value.y };
    const desired = { x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y };
    translate.value = { x: desired.x - layout.x, y: desired.y - layout.y };

    autoScroll();

    const origin = options.gridOrigin();
    const target = hitTest(
      { x: pointer.x - origin.x, y: pointer.y - origin.y },
      options.metrics(),
      options.count(),
    );

    if (target >= 0 && target !== draggingIndex.value) {
      options.onMove(draggingIndex.value, target);
      draggingIndex.value = target;
      // The tile is about to be re-laid-out in its new cell; recompute against
      // that next frame rather than letting it visibly jump.
      schedule();
    }
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

    if (delta !== 0) {
      scroller.scrollTop += delta;
      // Keep the loop alive while hovering the edge, even if the pointer is
      // perfectly still — otherwise scrolling stalls the moment you stop moving.
      schedule();
    }
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

  function stop(): void {
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
