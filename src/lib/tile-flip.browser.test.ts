import { afterEach, describe, expect, it } from "vite-plus/test";
import { captureTiles, flipTiles } from "./tile-flip";

/**
 * A FLIP is measurement, so there is nothing to test without a layout engine:
 * which cards are on screen, and how far each one has moved, are both questions
 * only the browser can answer.
 */

/** Deliberately not a multiple of `CARD`: a card seam landing exactly on the
 *  fold is its own question, and not the one these tests are asking. */
const VIEWPORT = 250;
const CARD = 100;

function renderGrid(count: number) {
  const scroller = document.createElement("div");
  scroller.style.cssText = `position:fixed;top:0;left:0;width:${CARD * 2}px;height:${VIEWPORT}px;overflow-y:auto`;

  const grid = document.createElement("div");
  for (let i = 0; i < count; i += 1) {
    const cell = document.createElement("div");
    const card = document.createElement("div");
    card.dataset.tileCard = "";
    card.style.cssText = `width:${CARD}px;height:${CARD}px;transform-origin:top left`;
    cell.append(card);
    grid.append(cell);
  }

  scroller.append(grid);
  document.body.append(scroller);

  /** Stands in for the grid handing every tile a new size. */
  const resize = (size: number): void => {
    for (const card of grid.querySelectorAll<HTMLElement>("[data-tile-card]")) {
      card.style.width = `${size}px`;
      card.style.height = `${size}px`;
    }
  };

  /** Stands in for a drag moving a tile through the order. */
  const reorder = (from: number, to: number): void => {
    const cells = [...grid.children];
    const moved = cells[from]!;
    moved.remove();
    grid.insertBefore(moved, cells[to] ?? null);
  };

  const lift = (index: number): Element => {
    const card = grid.querySelectorAll("[data-tile-card]")[index]!;
    (card as HTMLElement).dataset.dragging = "";
    return card;
  };

  return { grid, scroller, resize, reorder, lift };
}

const cards = (grid: HTMLElement) => [...grid.querySelectorAll("[data-tile-card]")];
const flips = (card: Element) => card.getAnimations().filter((a) => a.id === "tile-flip");

/** Which cards were animated, by position in the grid. */
const animatedIndices = (grid: HTMLElement) =>
  cards(grid).flatMap((card, index) => (flips(card).length > 0 ? [index] : []));

const keyframes = (card: Element) => (flips(card)[0]!.effect as KeyframeEffect).getKeyframes();

/** The transform each animation starts from, as a matrix. */
function startTransform(card: Element): DOMMatrixReadOnly {
  return new DOMMatrixReadOnly(String(keyframes(card)[0]!.transform));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("captureTiles", () => {
  it("takes the cards on screen and leaves the rest", () => {
    const { grid, scroller } = renderGrid(20);

    // Two fit the 250px viewport whole, and a third is halfway down it.
    expect(captureTiles(grid, scroller).size).toBe(3);
  });

  it("skips the cards scrolled off the top", () => {
    const { grid, scroller, resize } = renderGrid(20);
    // A quarter of card 10 is above the fold; 12 runs past the bottom of it.
    scroller.scrollTop = 10.25 * CARD;

    const before = captureTiles(grid, scroller);
    resize(50);
    flipTiles(before, 260);

    expect(animatedIndices(grid)).toEqual([10, 11, 12]);
  });

  it("has nothing to capture without a grid to measure", () => {
    const { scroller } = renderGrid(4);

    expect(captureTiles(null, scroller).size).toBe(0);
  });
});

describe("flipTiles", () => {
  it("starts each card at the size it is growing from", () => {
    const { grid, scroller, resize } = renderGrid(4);

    const before = captureTiles(grid, scroller);
    resize(200);
    flipTiles(before, 260);

    expect(startTransform(cards(grid)[0]!).a).toBeCloseTo(0.5, 5);
  });

  it("starts each card where it was, not where the grid has put it", () => {
    const { grid, scroller, resize } = renderGrid(4);

    const before = captureTiles(grid, scroller);
    resize(200);
    flipTiles(before, 260);

    // The first card has not moved; the second has been pushed a row down.
    expect(startTransform(cards(grid)[0]!).f).toBeCloseTo(0, 5);
    expect(startTransform(cards(grid)[1]!).f).toBeCloseTo(-100, 5);
  });

  it("ends where the grid has already put the tile", () => {
    const { grid, scroller, resize } = renderGrid(4);

    const before = captureTiles(grid, scroller);
    resize(200);
    flipTiles(before, 260);

    expect(String(keyframes(cards(grid)[0]!).at(-1)!.transform)).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });

  it("picks up from a step still in flight instead of snapping back to it", () => {
    const { grid, scroller, resize } = renderGrid(4);
    const card = cards(grid)[0]!;

    const first = captureTiles(grid, scroller);
    resize(200);
    flipTiles(first, 260);
    flips(card)[0]!.currentTime = 130;

    // Whatever the card looks like halfway through, the next step has to start
    // there — this is the slider being dragged across several stops.
    const midway = card.getBoundingClientRect();
    const second = captureTiles(grid, scroller);
    resize(400);
    flipTiles(second, 260);

    expect(flips(card).length).toBe(1);
    expect(card.getBoundingClientRect().width).toBeCloseTo(midway.width, 1);
  });

  it("leaves a card that has not moved alone", () => {
    const { grid, scroller } = renderGrid(4);

    flipTiles(captureTiles(grid, scroller), 260);

    expect(animatedIndices(grid)).toEqual([]);
  });

  it("does nothing when motion is reduced away to nothing", () => {
    const { grid, scroller, resize } = renderGrid(4);

    const before = captureTiles(grid, scroller);
    resize(200);
    flipTiles(before, 0);

    expect(animatedIndices(grid)).toEqual([]);
  });

  it("slides the tiles a drag displaces", () => {
    const { grid, scroller, reorder, lift } = renderGrid(3);
    lift(2);

    const before = captureTiles(grid, scroller);
    reorder(2, 0);
    flipTiles(before, 260);

    // The two it jumped over each start a row lower — where they were.
    const displaced = cards(grid).filter((card) => !card.matches("[data-dragging]"));
    for (const card of displaced) expect(startTransform(card).f).toBeCloseTo(-CARD, 5);
  });

  it("leaves the lifted card to the cursor", () => {
    const { grid, scroller, reorder, lift } = renderGrid(3);
    const lifted = lift(2);

    const before = captureTiles(grid, scroller);
    reorder(2, 0);
    flipTiles(before, 260);

    expect(flips(lifted)).toHaveLength(0);
  });

  it("animates that same card into place once it is dropped", () => {
    const { grid, scroller, lift } = renderGrid(3);
    const lifted = lift(2);

    // Where a lifted card sits is wherever the pointer left it.
    (lifted as HTMLElement).style.transform = "translate(40px, -180px)";
    const before = captureTiles(grid, scroller);
    delete (lifted as HTMLElement).dataset.dragging;
    (lifted as HTMLElement).style.transform = "";
    flipTiles(before, 260);

    expect(startTransform(lifted).e).toBeCloseTo(40, 5);
    expect(startTransform(lifted).f).toBeCloseTo(-180, 5);
  });

  it("survives a card that has gone from the page", () => {
    const { grid, scroller, resize } = renderGrid(4);

    const before = captureTiles(grid, scroller);
    cards(grid)[0]!.remove();
    resize(200);

    expect(() => flipTiles(before, 260)).not.toThrow();
  });
});
