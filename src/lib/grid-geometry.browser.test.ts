import { afterEach, describe, expect, it } from "vite-plus/test";
import { cellWidthFor, columnCount } from "./grid-geometry";

/**
 * `columnCount` reimplements a decision the browser makes: how many tracks
 * `repeat(auto-fill, minmax(Npx, 1fr))` produces at a given width. Arrow-key
 * navigation and drag hit-testing both trust that answer, so if it ever drifts
 * from the real layout the selection silently lands on the wrong tile.
 *
 * This is the reason the project runs a real Chromium instead of a DOM shim: a
 * synthetic DOM has no layout engine, so there is nothing here to compare
 * against.
 */

const GAP = 16;

function renderGrid(width: number, minTile: number, count: number): HTMLElement {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;top:0;left:0;width:${width}px`;

  const grid = document.createElement("div");
  grid.style.cssText = `display:grid;gap:${GAP}px;grid-template-columns:repeat(auto-fill, minmax(${minTile}px, 1fr))`;

  for (let i = 0; i < count; i += 1) {
    const cell = document.createElement("div");
    cell.style.height = "40px";
    grid.append(cell);
  }

  host.append(grid);
  document.body.append(host);
  return grid;
}

/** How many cells the browser actually put on the first row. */
function renderedColumns(grid: HTMLElement): number {
  const cells = [...grid.children] as HTMLElement[];
  const firstTop = cells[0]!.getBoundingClientRect().top;
  return cells.filter((cell) => cell.getBoundingClientRect().top === firstTop).length;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("columnCount against real CSS grid layout", () => {
  const widths = [200, 320, 400, 430, 500, 539, 540, 700, 861, 1000, 1280, 1600];
  const tileSizes = [80, 120, 160, 240, 320];

  for (const minTile of tileSizes) {
    for (const width of widths) {
      it(`agrees at ${width}px wide with ${minTile}px tiles`, () => {
        const grid = renderGrid(width, minTile, 40);

        expect(columnCount(width, minTile, GAP)).toBe(renderedColumns(grid));
      });
    }
  }
});

describe("cellWidthFor against real CSS grid layout", () => {
  it("matches the width the browser gives each track", () => {
    const grid = renderGrid(861, 160, 20);
    const columns = renderedColumns(grid);

    const actual = (grid.children[0] as HTMLElement).getBoundingClientRect().width;

    expect(cellWidthFor(861, columns, GAP, 160)).toBeCloseTo(actual, 1);
  });

  it("accounts for a tile that overflows a container narrower than itself", () => {
    // `minmax(320px, 1fr)` in a 200px container gives one 320px column that
    // overflows, not a 200px one.
    const grid = renderGrid(200, 320, 4);

    const actual = (grid.children[0] as HTMLElement).getBoundingClientRect().width;

    expect(actual).toBe(320);
    expect(cellWidthFor(200, 1, GAP, 320)).toBeCloseTo(actual, 1);
  });
});
