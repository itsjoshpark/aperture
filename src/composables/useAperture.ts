import { computed, inject, ref, shallowRef, type InjectionKey } from "vue";
import { createFsaFolderSource, type FolderSource } from "@/lib/fs/folder-source";
import { isFileSystemAccessSupported } from "@/lib/fs/fsa-adapter";
import type { FileSystemPort, ImageEntry } from "@/lib/fs/types";
import type { MoveDirection } from "@/lib/grid-geometry";
import { useGallery } from "./useGallery";
import { useReducedMotion, wait } from "./useReducedMotion";
import { useRenameSession } from "./useRenameSession";
import { useUnsavedGuard } from "./useUnsavedGuard";

/** Matches the tile's removal transition in `ImageTile.vue`. */
const REMOVE_DURATION = 180;

export interface ApertureOptions {
  /** Defaults to the File System Access implementation. */
  source?: FolderSource;
  /** Overridden by the e2e harness, which has no picker to feature-detect. */
  supported?: boolean;
}

export function createAperture(options: ApertureOptions = {}) {
  const source = options.source ?? createFsaFolderSource();
  const supported = options.supported ?? isFileSystemAccessSupported();
  const gallery = useGallery();
  const rename = useRenameSession(gallery);
  const guard = useUnsavedGuard(rename.dirty);
  const motion = useReducedMotion();

  /** A folder we have a handle for but not yet permission to read. */
  const lastFolderName = ref<string | null>(null);
  const busy = ref(false);

  /**
   * Whether the dialog is showing is tracked separately from what it is about.
   * Reka closes the dialog as part of handling the confirm click, so a single
   * piece of state would be cleared out from under the confirm handler before it
   * ran — the delete would silently do nothing.
   */
  const pendingDelete = shallowRef<ImageEntry | null>(null);
  const deleteDialogOpen = ref(false);

  /** Live column count, published by `GalleryGrid` as the container resizes. */
  const columns = ref(1);

  /**
   * What the grid actually shows. Rename mode takes over the ordering — the
   * whole point is to arrange images into an order that sorting cannot express.
   */
  const displayed = computed(() =>
    rename.active.value ? rename.draft.value : gallery.sorted.value,
  );

  const selectedIndex = computed(() => gallery.selectedIndexIn(displayed.value));
  const selectedEntry = computed(() => displayed.value[selectedIndex.value] ?? null);

  async function restoreLastFolder(): Promise<void> {
    if (!supported) return;
    lastFolderName.value = await source.lastName();
  }

  async function openFolder(): Promise<void> {
    await guard.attempt(async () => {
      await adopt(await source.open());
    });
  }

  /**
   * Reopening needs a click of its own: permission does not survive closing
   * every tab of the origin, and `requestPermission` only works inside a gesture.
   */
  async function reopenLastFolder(): Promise<void> {
    const port = await source.reopen();
    if (!port) {
      lastFolderName.value = await source.lastName();
      return;
    }
    await adopt(port);
  }

  async function forgetLastFolder(): Promise<void> {
    await source.forget();
    lastFolderName.value = null;
  }

  async function adopt(port: FileSystemPort | null): Promise<void> {
    if (!port) return;
    rename.cancel();
    rename.clearUndo();
    await gallery.open(port);
    lastFolderName.value = port.label;
  }

  function closeFolder(): void {
    void guard.attempt(() => {
      rename.cancel();
      rename.clearUndo();
      gallery.close();
    });
  }

  // ---------------------------------------------------------------- selection

  function moveSelectionBy(direction: MoveDirection): void {
    gallery.moveBy(direction, columns.value, displayed.value);
  }

  function openLargeView(): void {
    if (selectedEntry.value) gallery.view.value = "large";
  }

  function closeLargeView(): void {
    gallery.view.value = "grid";
  }

  // ------------------------------------------------------------------- delete

  function askToDelete(entry: ImageEntry | null = selectedEntry.value): void {
    if (!entry) return;
    pendingDelete.value = entry;
    deleteDialogOpen.value = true;
  }

  async function confirmDelete(): Promise<void> {
    const entry = pendingDelete.value;
    deleteDialogOpen.value = false;
    pendingDelete.value = null;
    if (!entry) return;

    busy.value = true;
    try {
      // Shrink the tile out first, then drop it from the list so the survivors
      // animate into the gap rather than snapping shut around a vanished cell.
      gallery.removingName.value = entry.name;
      await wait(motion.duration(REMOVE_DURATION));
      await gallery.remove(entry.name, displayed.value);
      if (rename.active.value) rename.forget(entry.name);
    } catch (cause) {
      gallery.error.value =
        cause instanceof Error ? cause.message : `Could not delete ${entry.name}.`;
    } finally {
      gallery.removingName.value = null;
      busy.value = false;
    }
  }

  // ------------------------------------------------------------------- rename

  async function enterRename(): Promise<void> {
    await rename.begin(displayed.value);
  }

  /** Escape out of rename mode — via the discard dialog if there is work to lose. */
  function exitRename(): void {
    if (!rename.active.value) return;
    void guard.attempt(() => rename.cancel());
  }

  async function applyRename(): Promise<void> {
    await rename.apply();
  }

  async function undoRename(): Promise<void> {
    await rename.undo();
  }

  return {
    supported,
    gallery,
    rename,
    guard,
    motion,
    columns,
    displayed,
    selectedIndex,
    selectedEntry,
    pendingDelete,
    deleteDialogOpen,
    busy,
    lastFolderName,
    hasFolder: computed(() => gallery.port.value !== null),
    restoreLastFolder,
    openFolder,
    reopenLastFolder,
    forgetLastFolder,
    closeFolder,
    moveSelectionBy,
    openLargeView,
    closeLargeView,
    askToDelete,
    confirmDelete,
    cancelDelete: () => {
      deleteDialogOpen.value = false;
    },
    enterRename,
    exitRename,
    applyRename,
    undoRename,
  };
}

export type Aperture = ReturnType<typeof createAperture>;

/**
 * Provided at the app level (`app.provide`) rather than from inside `App.vue`,
 * so the entry point decides where folders come from and `App.vue` stays the
 * same component in production and under test.
 */
export const APERTURE_KEY: InjectionKey<Aperture> = Symbol("aperture");

export function useAperture(): Aperture {
  const aperture = inject(APERTURE_KEY);
  if (!aperture) throw new Error("useAperture() called outside of an Aperture provider");
  return aperture;
}
