/**
 * The grid's own FLIP, for the two things that relay it: changing the preview
 * size, and dragging a tile through the order.
 *
 * `TransitionGroup` wraps the grid and looks like it should cover both, but its
 * move transition never fires — not on a resize, not on a re-sort, not on a
 * drag — and it could not carry the resize in any case, since a FLIP only
 * translates and half of that one is the tiles changing size. So: measure every
 * card before the change, measure it again after, and animate the difference
 * away.
 *
 * It is the card that moves, never the cell: the cell is the grid track, and the
 * grid has already put it where it belongs — which is also what makes it usable
 * as the drop placeholder. `origin-top-left` on the card is what lets a single
 * transform say both halves, since scaling about that corner leaves the
 * translation measuring the same corner it started from.
 */

/** Matches `--motion-slow`, the pace the rest of the grid moves at. */
export const TILE_FLIP_DURATION = 260;

/** `--motion-ease`. */
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** Ours to cancel; a card's other animations are not. */
const FLIP = "tile-flip";

/**
 * Where the tiles are now — to be called before the change, and handed straight
 * to `flipTiles` after it.
 *
 * Only the cards on screen: a folder of two thousand photos is two thousand
 * `animate()` calls per step of the slider otherwise, or per cell crossed by a
 * drag, and nobody is watching the ones being animated out of sight.
 */
export function captureTiles(
  grid: HTMLElement | null,
  scroller: HTMLElement | null,
): Map<Element, DOMRect> {
  const captured = new Map<Element, DOMRect>();
  if (!grid || !scroller) return captured;

  const view = scroller.getBoundingClientRect();
  for (const card of grid.querySelectorAll("[data-tile-card]")) {
    const box = card.getBoundingClientRect();
    if (box.bottom < view.top) continue;
    // Cards are in row order, so the first one past the fold ends it.
    if (box.top > view.bottom) break;
    captured.set(card, box);
  }
  return captured;
}

export function flipTiles(captured: Map<Element, DOMRect>, duration: number): void {
  if (duration <= 0) return;

  // Cancelled before anything is measured: a change still in flight is holding a
  // transform, and where each card is going is where it sits without one.
  for (const card of captured.keys()) {
    for (const animation of card.getAnimations()) {
      if (animation.id === FLIP) animation.cancel();
    }
  }

  // Measured before anything is animated, for the same reason in reverse:
  // `animate()` dirties style, and a loop that did both would re-run layout for
  // every card in turn.
  const moves: { card: Element; from: string }[] = [];
  for (const [card, before] of captured) {
    // The lifted card is being placed by the pointer, and a drag reorders the
    // grid under it every few cells. Checked here rather than at capture, so
    // that the card dropped out of a drag still animates into its cell.
    if (card.matches("[data-dragging]")) continue;

    const after = card.getBoundingClientRect();
    if (before.width === 0 || after.width === 0) continue;

    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const scale = before.width / after.width;
    if (dx === 0 && dy === 0 && scale === 1) continue;

    moves.push({ card, from: `translate(${dx}px, ${dy}px) scale(${scale})` });
  }

  for (const { card, from } of moves) {
    card.animate([{ transform: from }, { transform: "translate(0px, 0px) scale(1)" }], {
      duration,
      easing: EASING,
      // A lifted tile carries the drag's offset on this same element, and a
      // replacing animation would drop it on the floor for the whole 260ms.
      composite: "add",
      id: FLIP,
    });
  }
}
