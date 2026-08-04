import { computed, ref, shallowRef, watch } from "vue";
import type { FileSystemPort, ImageEntry } from "@/lib/fs/types";
import { moveSelection, type MoveDirection } from "@/lib/grid-geometry";
import { createPreviewSource } from "@/lib/preview/renderer";
import { findLeftoverTempNames } from "@/lib/rename-engine";
import { DEFAULT_SORT, sortEntries, type SortOrder } from "@/lib/sort";
import { ThumbnailCache } from "@/lib/thumbnails";

/**
 * The bounds on how wide a tile is *drawn*, not on the `minmax()` floor that
 * asks for it — the grid stretches its tracks to fill the row, so a 480px floor
 * draws as 632px whenever the width leaves two columns. `tileSizeStops` reads
 * these as the range it may offer, which is what keeps the number on the slider
 * and the picture on screen the same number.
 */
export const MIN_TILE_SIZE = 80;
export const MAX_TILE_SIZE = 640;
export const DEFAULT_TILE_SIZE = 160;

/** Preview size is a preference about your eyes and your screen, not about a
 *  particular folder, so it outlives both the folder and the tab. */
const TILE_SIZE_KEY = "aperture:tile-size";

/**
 * A stored size is untrusted input: it may predate a change to the bounds, or
 * have been edited by hand. Clamp rather than reject, so a value that is merely
 * out of range still gets you close to what you asked for.
 */
export function clampTileSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TILE_SIZE;
  return Math.min(MAX_TILE_SIZE, Math.max(MIN_TILE_SIZE, Math.round(value)));
}

export function readStoredTileSize(): number {
  // Touching localStorage throws outright when storage is disabled, and the
  // preview size is not worth failing to boot over.
  try {
    const stored = globalThis.localStorage?.getItem(TILE_SIZE_KEY);
    if (stored === null || stored === undefined || stored.trim() === "") return DEFAULT_TILE_SIZE;
    return clampTileSize(Number(stored));
  } catch {
    return DEFAULT_TILE_SIZE;
  }
}

function storeTileSize(value: number): void {
  try {
    globalThis.localStorage?.setItem(TILE_SIZE_KEY, String(value));
  } catch {
    // Private browsing, a full quota — the slider still works, it just forgets.
  }
}

export type GalleryView = "grid" | "large";

export function useGallery() {
  const port = shallowRef<FileSystemPort | null>(null);
  const entries = shallowRef<ImageEntry[]>([]);

  /**
   * Every name in the folder, images or not. Rename mode checks its targets
   * against this, and it must include non-images: a target colliding with a
   * spreadsheet is just as destructive as one colliding with a photo.
   *
   * Held rather than read on demand so the rename bar can flag a collision as
   * you type — but held *here*, refreshed by everything that changes the folder,
   * because a copy taken once when a rename session opened goes stale the moment
   * anything is deleted and then refuses a name that is no longer taken.
   */
  const allNames = shallowRef<string[]>([]);
  const sort = ref<SortOrder>({ ...DEFAULT_SORT });
  const tileSize = ref(readStoredTileSize());
  const view = ref<GalleryView>("grid");
  const loading = ref(false);
  const error = ref<string | null>(null);
  const leftoverTempNames = ref<string[]>([]);

  /**
   * Selection is held by filename, not index. Sorting, deleting, renaming and
   * undoing all reshuffle the list, and every one of them should leave the same
   * photos selected.
   */
  const selectedNames = ref<Set<string>>(new Set());

  /**
   * The one selected photo the rest of the app still thinks in terms of: where
   * the arrows move from, what the large view shows, what the filmstrip marks.
   * Always a member of `selectedNames`, or null when nothing is selected.
   */
  const cursorName = ref<string | null>(null);

  /**
   * Where a `Shift` range starts. Held apart from the cursor because a range is
   * redrawn from the same anchor every time it is extended — moving it with the
   * cursor would make each press extend from the last one instead.
   */
  const anchorName = ref<string | null>(null);

  /**
   * Set while tiles are playing their removal animation, so the grid can shrink
   * them out before the array changes and the survivors slide up.
   */
  const removingNames = ref<Set<string>>(new Set());

  watch(tileSize, storeTileSize);

  const previews = createPreviewSource();
  const thumbnails = new ThumbnailCache({ render: previews.render });

  /** Grid order. Rename mode overrides this with its own draft order. */
  const sorted = computed(() => sortEntries(entries.value, sort.value));

  /** The cursor's index, which is what "the selection" means to a single-photo view. */
  const selectedIndexIn = (list: ImageEntry[]) =>
    cursorName.value === null ? -1 : list.findIndex((entry) => entry.name === cursorName.value);

  const selectedEntriesIn = (list: ImageEntry[]) =>
    list.filter((entry) => selectedNames.value.has(entry.name));

  async function open(next: FileSystemPort): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      thumbnails.clear();
      port.value = next;
      await refresh();
      // A folder opens with nothing selected, the way a Finder window does. The
      // first arrow press lands on the first image, so the keyboard route in
      // costs one key rather than the folder guessing at a photo you might want.
      clearSelection();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "Could not read that folder.";
      port.value = null;
    } finally {
      loading.value = false;
    }
  }

  function close(): void {
    thumbnails.clear();
    // A HEIC worker's wasm heap stays as large as the biggest photo it has
    // decoded, so the pool goes away with the folder rather than idling at a
    // couple of hundred megabytes.
    previews.dispose();
    port.value = null;
    entries.value = [];
    allNames.value = [];
    clearSelection();
    view.value = "grid";
    leftoverTempNames.value = [];
  }

  async function refresh(): Promise<void> {
    const active = port.value;
    if (!active) return;

    entries.value = await active.list();
    allNames.value = await active.listAllNames();
    leftoverTempNames.value = findLeftoverTempNames(allNames.value);

    // Selected files may have been renamed or deleted out from under us. Drop
    // the names that are gone rather than guessing at a replacement: after a
    // rename that is every one of them, and landing back on the first photo in
    // the folder is not where you were.
    const surviving = new Set(entries.value.map((entry) => entry.name));
    setSelection(
      [...selectedNames.value].filter((name) => surviving.has(name)),
      cursorName.value,
      anchorName.value,
    );
  }

  /**
   * The single writer for all three pieces of selection state, so the invariant
   * they share — the cursor and the anchor are members of the set, or the set is
   * empty and both are null — cannot be broken one caller at a time.
   */
  function setSelection(
    names: Iterable<string>,
    cursor: string | null,
    anchor: string | null = cursor,
  ): void {
    const next = new Set(names);
    selectedNames.value = next;
    cursorName.value = cursor !== null && next.has(cursor) ? cursor : null;
    anchorName.value = anchor !== null && next.has(anchor) ? anchor : cursorName.value;
  }

  /** Replaces the whole selection with one photo, or clears it. */
  function select(name: string | null): void {
    setSelection(name === null ? [] : [name], name);
  }

  function clearSelection(): void {
    setSelection([], null);
  }

  /**
   * `Cmd`/`Ctrl` + click. The clicked photo becomes the anchor whether it was
   * added or removed, so a `Shift` + click after it ranges from where you last
   * pointed — and deselecting the cursor hands it to the nearest survivor rather
   * than leaving it pointing at an unselected tile.
   */
  function toggle(name: string, list: ImageEntry[]): void {
    const next = new Set(selectedNames.value);
    if (next.delete(name)) {
      setSelection(
        next,
        cursorName.value === name ? nearestIn(list, name, next) : cursorName.value,
      );
    } else {
      next.add(name);
      setSelection(next, name);
    }
  }

  /** `Shift` + click: the range from the anchor to here, replacing what was selected. */
  function extendTo(name: string, list: ImageEntry[]): void {
    const from = anchorName.value ?? cursorName.value ?? name;
    setSelection(rangeIn(list, from, name), name, from);
  }

  /**
   * Arrow-key navigation. `extend` redraws the range from the standing anchor,
   * so holding `Shift` and walking back over your own tracks shrinks the
   * selection again rather than only ever growing it.
   */
  function moveBy(
    direction: MoveDirection,
    columns: number,
    list: ImageEntry[],
    extend = false,
  ): void {
    if (list.length === 0) return;
    const next = moveSelection(selectedIndexIn(list), direction, columns, list.length);
    const name = list[next]?.name;
    if (name === undefined) return;

    if (!extend) {
      select(name);
      return;
    }
    const anchor = anchorName.value ?? cursorName.value ?? name;
    setSelection(rangeIn(list, anchor, name), name, anchor);
  }

  /** Every name between two entries of `list`, inclusive, in list order. */
  function rangeIn(list: ImageEntry[], from: string, to: string): string[] {
    const end = list.findIndex((entry) => entry.name === to);
    if (end === -1) return [];
    // An anchor that has been deleted or renamed away leaves nothing to range
    // across; the photo you just clicked is still a perfectly good selection.
    const start = list.findIndex((entry) => entry.name === from);
    if (start === -1) return [to];
    return list.slice(Math.min(start, end), Math.max(start, end) + 1).map((entry) => entry.name);
  }

  /** The member of `within` closest to `name` in `list`, searching forwards first. */
  function nearestIn(list: ImageEntry[], name: string, within: Set<string>): string | null {
    const at = list.findIndex((entry) => entry.name === name);
    if (at === -1) return null;
    for (let step = 1; step < list.length; step += 1) {
      for (const candidate of [list[at + step], list[at - step]]) {
        if (candidate && within.has(candidate.name)) return candidate.name;
      }
    }
    return null;
  }

  /**
   * Deletes files for good. The caller is responsible for confirming first —
   * there is no undo for this, only for renames.
   *
   * Selection lands on the next surviving image so you can keep pressing Delete
   * to cull a run of shots without reaching for the mouse.
   */
  async function removeMany(names: string[], list: ImageEntry[]): Promise<void> {
    const active = port.value;
    if (!active || names.length === 0) return;

    // Worked out before anything goes, while the list still says which survivor
    // follows the last of them: the photo after the deleted run, or the one
    // before it when the run reached the end.
    const doomed = new Set(names);
    const last = list.reduce((at, entry, index) => (doomed.has(entry.name) ? index : at), -1);
    const survivor =
      list.slice(last + 1).find((entry) => !doomed.has(entry.name)) ??
      list
        .slice(0, last)
        .reverse()
        .find((entry) => !doomed.has(entry.name)) ??
      null;

    // One file failing must not strand the ones already off the disk in the
    // grid, so the lists are rebuilt from what actually went and the failure is
    // raised afterwards.
    const gone = new Set<string>();
    let failure: unknown = null;
    for (const name of names) {
      try {
        await active.delete(name);
      } catch (cause) {
        failure ??= cause;
        continue;
      }
      thumbnails.invalidate(name);
      gone.add(name);
    }

    entries.value = entries.value.filter((entry) => !gone.has(entry.name));
    // Deleting does not re-list the folder, so this is what keeps the name list
    // honest in between refreshes.
    allNames.value = allNames.value.filter((existing) => !gone.has(existing));

    select(survivor?.name ?? null);
    if (failure !== null) throw failure;
  }

  return {
    port,
    entries,
    allNames,
    sorted,
    sort,
    tileSize,
    view,
    loading,
    error,
    selectedNames,
    /** The cursor, under the name the single-photo views have always known it by. */
    selectedName: computed(() => cursorName.value),
    removingNames,
    leftoverTempNames,
    thumbnails,
    label: computed(() => port.value?.label ?? ""),
    isEmpty: computed(() => !loading.value && entries.value.length === 0),
    selectedIndexIn,
    selectedEntriesIn,
    open,
    close,
    refresh,
    select,
    clearSelection,
    toggle,
    extendTo,
    moveBy,
    removeMany,
  };
}

export type Gallery = ReturnType<typeof useGallery>;
