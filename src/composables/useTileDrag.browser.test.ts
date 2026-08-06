import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { effectScope, nextTick } from "vue";
import type { GridMetrics } from "@/lib/grid-geometry";
import { useTileDrag, type DragRun, type TileDragOptions } from "./useTileDrag";

/**
 * Drag-reorder in a real browser, because there is nothing here that a synthetic
 * DOM could answer. The threshold is measured in pointer coordinates, the card
 * follows a `getBoundingClientRect()`, the loop runs on `requestAnimationFrame`,
 * and pointer capture is what keeps the drag alive once the tile moves out from
 * under the cursor.
 *
 * The grid below is built rather than rendered: `GalleryGrid` supplies the
 * geometry through `TileDragOptions`, so a harness that supplies the same
 * numbers exercises the same code without dragging a component tree along.
 */

const CELL = 100;
const GAP = 10;
const COLUMNS = 3;

const metrics: GridMetrics = {
  columns: COLUMNS,
  cellWidth: CELL,
  cellHeight: CELL,
  gap: GAP,
};

/** Where the centre of cell `index` is, in the coordinates the grid is laid out in. */
function centreOf(index: number): { x: number; y: number } {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  return {
    x: column * (CELL + GAP) + CELL / 2,
    y: row * (CELL + GAP) + CELL / 2,
  };
}

const scopes: ReturnType<typeof effectScope>[] = [];
const mounted: HTMLElement[] = [];

afterEach(() => {
  // `useTileDrag` unbinds its window listeners from `onScopeDispose`, so without
  // a scope every test would leave a live drag attached to the next one.
  for (const scope of scopes.splice(0)) scope.stop();
  for (const element of mounted.splice(0)) element.remove();
});

interface Harness {
  drag: ReturnType<typeof useTileDrag>;
  /** Every `onMove` call, in order — the record of where the run was placed. */
  moves: number[];
  begins: number[];
  scroller: HTMLElement;
  press: (index: number) => void;
  moveTo: (point: { x: number; y: number }) => Promise<void>;
  release: () => void;
  cellAt: (index: number) => HTMLElement;
}

function harness(
  count: number,
  options: {
    run?: DragRun;
    /** Taller than the scroller, so there is something to auto-scroll through. */
    contentHeight?: number;
    onCancel?: () => void;
  } = {},
): Harness {
  const scroller = document.createElement("div");
  scroller.style.cssText = `position:fixed;top:0;left:0;width:${
    COLUMNS * CELL + (COLUMNS - 1) * GAP
  }px;height:${CELL * 2}px;overflow-y:auto`;

  const grid = document.createElement("div");
  grid.style.cssText = "position:relative";

  const cells: HTMLElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const cell = document.createElement("div");
    const { x, y } = centreOf(index);
    // Absolutely positioned so a cell's rect matches the geometry the options
    // report, which is what `follow()` measures against.
    cell.style.cssText = `position:absolute;left:${x - CELL / 2}px;top:${
      y - CELL / 2
    }px;width:${CELL}px;height:${CELL}px`;
    grid.append(cell);
    cells.push(cell);
  }

  scroller.append(grid);
  document.body.append(scroller);
  mounted.push(scroller);

  const moves: number[] = [];
  const begins: number[] = [];

  const config: TileDragOptions = {
    scroller: () => scroller,
    contentHeight: () => options.contentHeight ?? grid.offsetHeight,
    count: () => count,
    metrics: () => metrics,
    gridOrigin: () => {
      const rect = grid.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    },
    onBegin: (index) => {
      begins.push(index);
      return options.run;
    },
    onMove: (start) => void moves.push(start),
    onCancel: options.onCancel,
  };

  const scope = effectScope();
  scopes.push(scope);
  const drag = scope.run(() => useTileDrag(config))!;

  const pointerId = 1;

  function event(type: string, point: { x: number; y: number }): PointerEvent {
    return new PointerEvent(type, {
      pointerId,
      clientX: point.x,
      clientY: point.y,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
  }

  return {
    drag,
    moves,
    begins,
    scroller,
    cellAt: (index) => cells[index]!,
    press: (index) => {
      const cell = cells[index]!;
      const rect = cell.getBoundingClientRect();
      const point = { x: rect.left + CELL / 2, y: rect.top + CELL / 2 };
      const down = event("pointerdown", point);
      // `onPointerDown` reads `currentTarget`, which only exists during dispatch.
      Object.defineProperty(down, "currentTarget", { value: cell });
      drag.onPointerDown(down, index);
    },
    moveTo: async (point) => {
      window.dispatchEvent(event("pointermove", point));
      // The move handler awaits `onBegin`, and everything after the threshold
      // runs on an animation frame.
      await nextTick();
      await frame();
    },
    release: () => window.dispatchEvent(event("pointerup", { x: 0, y: 0 })),
  };
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** A point offset from a cell's centre, in viewport coordinates. */
function viewportCentre(cell: HTMLElement): { x: number; y: number } {
  const rect = cell.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

describe("becoming a drag", () => {
  test("a press that barely moves stays a click", async () => {
    const { drag, press, moveTo, begins, cellAt } = harness(6);

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 3, y: from.y + 3 });

    expect(drag.dragging.value).toBe(false);
    expect(begins).toEqual([]);
  });

  test("crossing the threshold enters rename mode exactly once", async () => {
    const { drag, press, moveTo, begins, cellAt } = harness(6);

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });
    await moveTo({ x: from.x + 40, y: from.y });

    expect(drag.dragging.value).toBe(true);
    expect(begins).toEqual([0]);
  });
});

describe("placing the run", () => {
  test("gathers a scattered selection even when the run already starts here", async () => {
    // The pressed tile is at index 0 and is the first of the run, so the start
    // it computes is the index it already has. The call still has to happen:
    // it is what collects a selection with gaps in it into one block.
    const { press, moveTo, moves, cellAt } = harness(6, { run: { size: 3, offset: 0 } });

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });

    expect(moves).toEqual([0]);
  });

  test("a run cannot start so late that its tail falls off the end", async () => {
    const { press, moveTo, moves, cellAt } = harness(6, { run: { size: 3, offset: 0 } });

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });
    // Aimed at the last cell, which would put the run's tail at index 7 of 6.
    await moveTo(viewportCentre(cellAt(5)));

    expect(moves.at(-1)).toBe(3);
  });

  test("the run keeps its offset under the cursor", async () => {
    // Pressing the middle tile of three means the run starts one before wherever
    // the cursor lands.
    const { press, moveTo, moves, cellAt } = harness(9, { run: { size: 3, offset: 1 } });

    press(1);
    const from = viewportCentre(cellAt(1));
    await moveTo({ x: from.x + 20, y: from.y });
    await moveTo(viewportCentre(cellAt(4)));

    expect(moves.at(-1)).toBe(3);
  });

  test("carries the rest of the run but not the tile under the cursor", async () => {
    const { drag, press, moveTo, cellAt } = harness(9, { run: { size: 3, offset: 1 } });

    press(1);
    const from = viewportCentre(cellAt(1));
    await moveTo({ x: from.x + 20, y: from.y });

    expect(drag.draggingIndex.value).toBe(1);
    expect(drag.carries(0)).toBe(true);
    expect(drag.carries(1)).toBe(false);
    expect(drag.carries(2)).toBe(true);
    expect(drag.carries(3)).toBe(false);
  });
});

describe("auto-scroll", () => {
  test("stops at the laid-out height rather than the scrollable one", async () => {
    // `contentHeight` is deliberately smaller than what the transformed card
    // makes `scrollHeight` report. Trusting `scrollHeight` here is the loop that
    // runs off the last row into blank space.
    const { press, moveTo, scroller, cellAt } = harness(30, { contentHeight: CELL * 4 });

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });

    const limit = CELL * 4 - scroller.clientHeight;
    for (let i = 0; i < 40; i += 1) {
      await moveTo({ x: from.x, y: scroller.getBoundingClientRect().bottom - 2 });
    }

    expect(scroller.scrollTop).toBe(limit);
  });
});

describe("ending", () => {
  test("flags the click a drop leaves behind, for one turn of the loop", async () => {
    const { drag, press, moveTo, release, cellAt } = harness(6);

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });
    release();

    // The retargeted click arrives synchronously after pointerup; the grid
    // consults this to know it is not a fresh one.
    expect(drag.justDropped()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(drag.justDropped()).toBe(false);
  });

  test("a press that never became a drag leaves no flag to suppress the click", () => {
    const { drag, press, release } = harness(6);

    press(0);
    release();

    expect(drag.justDropped()).toBe(false);
  });

  test("Escape abandons the drag and asks for it to be undone", async () => {
    const onCancel = vi.fn();
    const { drag, press, moveTo, cellAt } = harness(6, { onCancel });

    press(0);
    const from = viewportCentre(cellAt(0));
    await moveTo({ x: from.x + 20, y: from.y });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(drag.dragging.value).toBe(false);
    expect(drag.draggingIndex.value).toBe(-1);
  });

  test("Escape before the threshold is not the drag's to claim", () => {
    const onCancel = vi.fn();
    const { press } = harness(6, { onCancel });

    press(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onCancel).not.toHaveBeenCalled();
  });

  test("releasing resets everything the next press reads", async () => {
    const { drag, press, moveTo, release, cellAt } = harness(9, { run: { size: 3, offset: 1 } });

    press(1);
    const from = viewportCentre(cellAt(1));
    await moveTo({ x: from.x + 20, y: from.y });
    release();

    expect(drag.dragging.value).toBe(false);
    expect(drag.draggingIndex.value).toBe(-1);
    expect(drag.translate.value).toEqual({ x: 0, y: 0 });
    expect(drag.carries(0)).toBe(false);
  });
});

test("ignores a press that is not the primary button", () => {
  const { drag } = harness(6);
  const cell = document.createElement("div");

  const right = new PointerEvent("pointerdown", { pointerId: 1, button: 2 });
  Object.defineProperty(right, "currentTarget", { value: cell });
  drag.onPointerDown(right, 0);

  expect(drag.draggingIndex.value).toBe(-1);
});
