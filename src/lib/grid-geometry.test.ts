import { describe, expect, it } from "vite-plus/test";
import {
  cellWidthFor,
  columnCount,
  hitTest,
  indexToCell,
  moveSelection,
  reorder,
  stopIndexFor,
  tileSizeStops,
} from "./grid-geometry";

describe("columnCount", () => {
  it("fits as many whole tiles as the width allows", () => {
    // 4 columns need 4*100 + 3*10 = 430; a fifth would need 540.
    expect(columnCount(430, 100, 10)).toBe(4);
    expect(columnCount(539, 100, 10)).toBe(4);
    expect(columnCount(540, 100, 10)).toBe(5);
  });

  it("ignores the gap after the final column", () => {
    expect(columnCount(200, 100, 0)).toBe(2);
    expect(columnCount(210, 100, 10)).toBe(2);
  });

  it("never returns zero, however narrow the container", () => {
    expect(columnCount(10, 100, 10)).toBe(1);
    expect(columnCount(0, 100, 10)).toBe(1);
    expect(columnCount(-5, 100, 10)).toBe(1);
  });
});

describe("cellWidthFor", () => {
  it("splits the leftover space between the columns", () => {
    expect(cellWidthFor(430, 4, 10)).toBe(100);
    expect(cellWidthFor(500, 4, 10)).toBeCloseTo(117.5);
  });

  it("gives a single column the whole width", () => {
    expect(cellWidthFor(300, 1, 10)).toBe(300);
  });

  it("never reports a cell narrower than the tile minimum", () => {
    // `minmax(320px, 1fr)` overflows a 200px container rather than shrinking,
    // so the cell on screen is 320px wide. See the browser test for proof.
    expect(cellWidthFor(200, 1, 10, 320)).toBe(320);
  });

  it("ignores the minimum once the columns are wider than it", () => {
    expect(cellWidthFor(430, 4, 10, 80)).toBe(100);
  });
});

describe("tileSizeStops", () => {
  it("offers one size per column count, ascending", () => {
    // 430 wide with a 10px gap: 1 column of 430, 2 of 210, 3 of 136, 4 of 100.
    expect(tileSizeStops(430, 10, 80, 480)).toEqual([100, 136, 210, 430]);
  });

  it("gives each stop the width its columns are really given", () => {
    for (const size of tileSizeStops(1000, 16, 80, 480)) {
      const columns = columnCount(1000, size, 16);
      expect(Math.floor(cellWidthFor(1000, columns, 16))).toBe(size);
    }
  });

  it("lands every stop on a column count of its own", () => {
    const counts = tileSizeStops(1280, 16, 80, 480).map((size) => columnCount(1280, size, 16));

    expect(new Set(counts).size).toBe(counts.length);
  });

  it("drops the sizes outside the slider's range", () => {
    const stops = tileSizeStops(2000, 16, 80, 480);

    expect(Math.min(...stops)).toBeGreaterThanOrEqual(80);
    expect(Math.max(...stops)).toBeLessThanOrEqual(480);
  });

  it("has nothing to offer for a width it has not measured yet", () => {
    expect(tileSizeStops(0, 16, 80, 480)).toEqual([]);
    expect(tileSizeStops(-100, 16, 80, 480)).toEqual([]);
  });

  it("has nothing to offer for a container narrower than the smallest tile", () => {
    expect(tileSizeStops(60, 16, 80, 480)).toEqual([]);
  });
});

describe("stopIndexFor", () => {
  const stops = [100, 136, 210, 430];

  it("finds the stop a size is already sitting on", () => {
    expect(stopIndexFor(stops, 136)).toBe(1);
  });

  it("reads a size between two stops the way the grid does", () => {
    // 200px still leaves room for 210px columns, so it draws as the 210 stop.
    expect(stopIndexFor(stops, 200)).toBe(2);
    expect(stopIndexFor(stops, 101)).toBe(1);
  });

  it("pins a size beyond the widest stop to the end", () => {
    expect(stopIndexFor(stops, 480)).toBe(3);
  });

  it("pins a size below the narrowest stop to the start", () => {
    expect(stopIndexFor(stops, 80)).toBe(0);
  });

  it("agrees with the column count the size would produce", () => {
    const width = 1280;
    const stopsHere = tileSizeStops(width, 16, 80, 640);

    for (const size of [80, 97, 160, 233, 300, 480]) {
      const index = stopIndexFor(stopsHere, size);

      expect(columnCount(width, stopsHere[index]!, 16)).toBe(columnCount(width, size, 16));
    }
  });

  it("settles for the widest stop when the size outruns every one of them", () => {
    // A single column is off the list, so a size that would produce one has no
    // stop of its own and takes the closest thing on offer.
    const width = 1280;
    const stopsHere = tileSizeStops(width, 16, 80, 640);

    expect(columnCount(width, 900, 16)).toBe(1);
    expect(stopIndexFor(stopsHere, 900)).toBe(stopsHere.length - 1);
  });
});

describe("indexToCell", () => {
  it("maps indices onto rows and columns", () => {
    expect(indexToCell(0, 4)).toEqual({ row: 0, column: 0 });
    expect(indexToCell(3, 4)).toEqual({ row: 0, column: 3 });
    expect(indexToCell(4, 4)).toEqual({ row: 1, column: 0 });
    expect(indexToCell(9, 4)).toEqual({ row: 2, column: 1 });
  });
});

describe("moveSelection", () => {
  const columns = 4;
  const count = 10; // rows of 4, 4, 2

  it("steps one at a time left and right", () => {
    expect(moveSelection(5, "right", columns, count)).toBe(6);
    expect(moveSelection(5, "left", columns, count)).toBe(4);
  });

  it("wraps across rows, like walking the sequence", () => {
    expect(moveSelection(4, "left", columns, count)).toBe(3);
    expect(moveSelection(3, "right", columns, count)).toBe(4);
  });

  it("stops at the ends rather than wrapping around", () => {
    expect(moveSelection(0, "left", columns, count)).toBe(0);
    expect(moveSelection(9, "right", columns, count)).toBe(9);
  });

  it("moves a whole row vertically", () => {
    expect(moveSelection(1, "down", columns, count)).toBe(5);
    expect(moveSelection(5, "up", columns, count)).toBe(1);
  });

  it("holds still going up from the first row", () => {
    expect(moveSelection(2, "up", columns, count)).toBe(2);
  });

  it("holds still going down from the last row", () => {
    expect(moveSelection(9, "down", columns, count)).toBe(9);
  });

  it("lands on the last image when the row below is short", () => {
    // Index 6 is above nothing — the final row holds only indices 8 and 9 — but
    // there is visibly something below, so go to it.
    expect(moveSelection(6, "down", columns, count)).toBe(9);
  });

  it("jumps to the ends", () => {
    expect(moveSelection(5, "home", columns, count)).toBe(0);
    expect(moveSelection(5, "end", columns, count)).toBe(9);
  });

  it("returns -1 for an empty grid", () => {
    expect(moveSelection(0, "right", columns, 0)).toBe(-1);
  });

  it("picks a sensible first target when nothing is selected", () => {
    expect(moveSelection(-1, "right", columns, count)).toBe(0);
    expect(moveSelection(-1, "end", columns, count)).toBe(9);
  });
});

describe("hitTest", () => {
  const metrics = { columns: 4, cellWidth: 100, cellHeight: 120, gap: 10 };

  it("finds the cell under a point", () => {
    expect(hitTest({ x: 5, y: 5 }, metrics, 10)).toBe(0);
    expect(hitTest({ x: 115, y: 5 }, metrics, 10)).toBe(1);
    expect(hitTest({ x: 5, y: 135 }, metrics, 10)).toBe(4);
    expect(hitTest({ x: 345, y: 135 }, metrics, 10)).toBe(7);
  });

  it("treats the gap as belonging to the cell before it", () => {
    expect(hitTest({ x: 105, y: 5 }, metrics, 10)).toBe(0);
  });

  it("clamps a point past the last tile to the last index", () => {
    expect(hitTest({ x: 380, y: 900 }, metrics, 10)).toBe(9);
  });

  it("clamps a point above or left of the grid to the first index", () => {
    expect(hitTest({ x: -50, y: -50 }, metrics, 10)).toBe(0);
  });

  it("returns -1 for an empty grid", () => {
    expect(hitTest({ x: 5, y: 5 }, metrics, 0)).toBe(-1);
  });
});

describe("reorder", () => {
  it("moves an item later", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const items = ["a", "b", "c"];
    reorder(items, 0, 2);

    expect(items).toEqual(["a", "b", "c"]);
  });

  it("returns the same array when nothing moves", () => {
    const items = ["a", "b", "c"];

    expect(reorder(items, 1, 1)).toBe(items);
  });

  it("clamps a target past the end", () => {
    expect(reorder(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });
});
