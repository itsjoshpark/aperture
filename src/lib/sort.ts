import type { ImageEntry } from "./fs/types";

export type SortField = "name" | "modified" | "taken";
export type SortDirection = "asc" | "desc";

export interface SortOrder {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortOrder = { field: "name", direction: "asc" };

/**
 * Numeric collation, so `IMG_2` comes before `IMG_10` the way a person expects
 * and the way Finder does it — a plain string sort puts `IMG_10` first.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareByName(a: ImageEntry, b: ImageEntry): number {
  const byName = collator.compare(a.name, b.name);
  // `sensitivity: "base"` calls "photo.jpg" and "PHOTO.JPG" equal, which would
  // leave their relative order down to whatever the filesystem happened to
  // return. Break the tie so the grid never reshuffles between reads.
  return byName !== 0 ? byName : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function compareByModified(a: ImageEntry, b: ImageEntry): number {
  const byDate = a.lastModified - b.lastModified;
  return byDate !== 0 ? byDate : compareByName(a, b);
}

/**
 * Files with no EXIF date fall back to their modified date rather than being
 * herded to one end. A folder is usually mostly camera files with a screenshot
 * or two in it, and burying those under a heading is a worse answer than putting
 * each one roughly where it belongs.
 */
export function compareByTaken(a: ImageEntry, b: ImageEntry): number {
  const byDate = (a.dateTaken?.epoch ?? a.lastModified) - (b.dateTaken?.epoch ?? b.lastModified);
  return byDate !== 0 ? byDate : compareByName(a, b);
}

const COMPARATORS: Record<SortField, (a: ImageEntry, b: ImageEntry) => number> = {
  name: compareByName,
  modified: compareByModified,
  taken: compareByTaken,
};

export function sortEntries(entries: ImageEntry[], order: SortOrder): ImageEntry[] {
  const sorted = [...entries].sort(COMPARATORS[order.field]);
  return order.direction === "asc" ? sorted : sorted.reverse();
}

export const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  modified: "Date modified",
  taken: "Date taken",
};
