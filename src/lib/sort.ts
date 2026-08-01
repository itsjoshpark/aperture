import type { ImageEntry } from "./fs/types";

export type SortField = "name" | "date";
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

export function compareByDate(a: ImageEntry, b: ImageEntry): number {
  const byDate = a.lastModified - b.lastModified;
  return byDate !== 0 ? byDate : compareByName(a, b);
}

export function sortEntries(entries: ImageEntry[], order: SortOrder): ImageEntry[] {
  const compare = order.field === "name" ? compareByName : compareByDate;
  const sorted = [...entries].sort(compare);
  return order.direction === "asc" ? sorted : sorted.reverse();
}

export const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  date: "Date modified",
};
