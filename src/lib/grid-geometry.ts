/**
 * Grid maths, kept pure so both arrow-key navigation and drag-reorder use one
 * definition of "which cell is that?".
 *
 * The grid is `repeat(auto-fill, minmax(tile, 1fr))`, which means the browser
 * decides the column count and then stretches the columns to fill the row. This
 * module reproduces that first decision, and takes measured cell sizes for the
 * rest rather than guessing at them.
 */

export interface GridMetrics {
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
}

export type MoveDirection = "left" | "right" | "up" | "down" | "home" | "end";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** What `auto-fill` will settle on for this width. Always at least one. */
export function columnCount(containerWidth: number, minTileWidth: number, gap: number): number {
  if (containerWidth <= 0 || minTileWidth <= 0) return 1;
  // n columns need n*tile + (n-1)*gap, so add one gap to both sides and divide.
  return Math.max(1, Math.floor((containerWidth + gap) / (minTileWidth + gap)));
}

/**
 * The width the browser gives each track.
 *
 * `minmax(tile, 1fr)` has a floor: when the container is narrower than a single
 * tile, `auto-fill` still produces one column and that column *overflows* the
 * container rather than shrinking. Dividing the container width alone would
 * report a cell narrower than the one on screen, and drag hit-testing would
 * drift. Only reachable at large tile sizes in a narrow window — which is
 * exactly where nobody would think to look.
 */
export function cellWidthFor(
  containerWidth: number,
  columns: number,
  gap: number,
  minTileWidth = 0,
): number {
  if (columns <= 0) return Math.max(containerWidth, minTileWidth);
  return Math.max((containerWidth - gap * (columns - 1)) / columns, minTileWidth);
}

/**
 * The tile sizes that draw differently, ascending.
 *
 * `minmax(tile, 1fr)` stretches the tracks to fill the row, so what lands on
 * screen changes only when the column count does — every size between two
 * counts renders identically, which is a slider whose middle does nothing. Each
 * stop is the width its columns are actually given, so setting one asks for a
 * size the grid can honour exactly.
 */
export function tileSizeStops(
  containerWidth: number,
  gap: number,
  minSize: number,
  maxSize: number,
): number[] {
  if (containerWidth <= 0 || minSize <= 0) return [];

  const stops: number[] = [];
  for (let columns = 1; ; columns += 1) {
    // Floor rather than round: a stop wider than the track it came from would
    // fall into the column count below and stop being its own step.
    const size = Math.floor(cellWidthFor(containerWidth, columns, gap));
    if (size < minSize) break;
    if (size <= maxSize && size !== stops.at(-1)) stops.push(size);
  }
  return stops.reverse();
}

/**
 * Which stop the grid is drawing at for a given size.
 *
 * A size is rendered at the narrowest stop that reaches it — that is the same
 * `floor((width + gap) / (size + gap))` the browser applies, read off the list
 * — so a size restored from an earlier session, or from a window of another
 * width, still puts the thumb where the eye says it should be.
 */
export function stopIndexFor(stops: number[], size: number): number {
  const index = stops.findIndex((stop) => stop >= size);
  return index === -1 ? stops.length - 1 : index;
}

export function indexToCell(index: number, columns: number): { row: number; column: number } {
  return { row: Math.floor(index / columns), column: index % columns };
}

/**
 * Where an arrow key should land.
 *
 * Left and right walk the sequence, so they wrap across rows the way Finder
 * does. Up and down move a whole row; when the row below is a short final row,
 * down lands on the last image rather than refusing to move — refusing feels
 * broken when there is visibly something below you.
 */
export function moveSelection(
  index: number,
  direction: MoveDirection,
  columns: number,
  count: number,
): number {
  if (count === 0) return -1;
  if (index < 0) return direction === "end" ? count - 1 : 0;

  const last = count - 1;

  switch (direction) {
    case "home":
      return 0;
    case "end":
      return last;
    case "left":
      return clamp(index - 1, 0, last);
    case "right":
      return clamp(index + 1, 0, last);
    case "up": {
      const target = index - columns;
      return target >= 0 ? target : index;
    }
    case "down": {
      const target = index + columns;
      if (target <= last) return target;
      const onLastRow = indexToCell(index, columns).row === indexToCell(last, columns).row;
      return onLastRow ? index : last;
    }
  }
}

/**
 * The index of the cell under a point, in coordinates relative to the grid's
 * content box. Used while dragging; clamped so a pointer past the final tile
 * still means "drop at the end" rather than nothing.
 */
export function hitTest(
  point: { x: number; y: number },
  metrics: GridMetrics,
  count: number,
): number {
  if (count === 0) return -1;

  const { columns, cellWidth, cellHeight, gap } = metrics;
  const column = clamp(Math.floor(point.x / (cellWidth + gap)), 0, columns - 1);
  const row = Math.max(0, Math.floor(point.y / (cellHeight + gap)));

  return clamp(row * columns + column, 0, count - 1);
}

/** Move an item within an array. Returns a new array; the input is untouched. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(clamp(to, 0, next.length), 0, moved!);
  return next;
}
