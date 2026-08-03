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
   * photo selected.
   */
  const selectedName = ref<string | null>(null);

  /**
   * Set while a tile is playing its removal animation, so the grid can shrink it
   * out before the array changes and the survivors slide up.
   */
  const removingName = ref<string | null>(null);

  watch(tileSize, storeTileSize);

  const previews = createPreviewSource();
  const thumbnails = new ThumbnailCache({ render: previews.render });

  /** Grid order. Rename mode overrides this with its own draft order. */
  const sorted = computed(() => sortEntries(entries.value, sort.value));

  const selectedIndexIn = (list: ImageEntry[]) =>
    selectedName.value === null ? -1 : list.findIndex((entry) => entry.name === selectedName.value);

  async function open(next: FileSystemPort): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      thumbnails.clear();
      port.value = next;
      await refresh();
      selectedName.value = sorted.value[0]?.name ?? null;
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
    selectedName.value = null;
    view.value = "grid";
    leftoverTempNames.value = [];
  }

  async function refresh(): Promise<void> {
    const active = port.value;
    if (!active) return;

    entries.value = await active.list();
    allNames.value = await active.listAllNames();
    leftoverTempNames.value = findLeftoverTempNames(allNames.value);

    // The selected file may have been renamed or deleted out from under us.
    if (!entries.value.some((entry) => entry.name === selectedName.value)) {
      selectedName.value = sorted.value[0]?.name ?? null;
    }
  }

  function select(name: string | null): void {
    selectedName.value = name;
  }

  /** Arrow-key navigation. Never clears the selection. */
  function moveBy(direction: MoveDirection, columns: number, list: ImageEntry[]): void {
    if (list.length === 0) return;
    const next = moveSelection(selectedIndexIn(list), direction, columns, list.length);
    if (next >= 0) selectedName.value = list[next]!.name;
  }

  /**
   * Deletes a file for good. The caller is responsible for confirming first —
   * there is no undo for this, only for renames.
   *
   * Selection lands on the next image so you can keep pressing Delete to cull a
   * run of shots without reaching for the mouse.
   */
  async function remove(name: string, list: ImageEntry[]): Promise<void> {
    const active = port.value;
    if (!active) return;

    const at = list.findIndex((entry) => entry.name === name);
    const successor = list[at + 1] ?? list[at - 1] ?? null;

    await active.delete(name);
    thumbnails.invalidate(name);
    entries.value = entries.value.filter((entry) => entry.name !== name);
    // Deleting does not re-list the folder, so this is what keeps the name list
    // honest in between refreshes.
    allNames.value = allNames.value.filter((existing) => existing !== name);

    if (selectedName.value === name) selectedName.value = successor?.name ?? null;
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
    selectedName,
    removingName,
    leftoverTempNames,
    thumbnails,
    label: computed(() => port.value?.label ?? ""),
    isEmpty: computed(() => !loading.value && entries.value.length === 0),
    selectedIndexIn,
    open,
    close,
    refresh,
    select,
    moveBy,
    remove,
  };
}

export type Gallery = ReturnType<typeof useGallery>;
