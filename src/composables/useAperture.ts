import { computed, inject, ref, shallowRef, type InjectionKey } from "vue";
import { createFsaFolderSource, type FolderSource } from "@/lib/fs/folder-source";
import { isFileSystemAccessSupported } from "@/lib/fs/fsa-adapter";
import type { FileSystemPort, ImageEntry } from "@/lib/fs/types";
import { clamp, type MoveDirection } from "@/lib/grid-geometry";
import { planSingleRename } from "@/lib/naming";
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

  const busy = ref(false);

  /**
   * Whether the dialog is showing is tracked separately from what it is about.
   * Reka closes the dialog as part of handling the confirm click, so a single
   * piece of state would be cleared out from under the confirm handler before it
   * ran — the delete would silently do nothing.
   */
  const pendingDeletes = shallowRef<ImageEntry[]>([]);
  const deleteDialogOpen = ref(false);

  /** The same split, for the same reason, for the single-file rename dialog. */
  const pendingRename = shallowRef<ImageEntry | null>(null);
  const renameDialogOpen = ref(false);

  /** Live column count, published by `GalleryGrid` as the container resizes. */
  const columns = ref(1);

  /**
   * The tile sizes that look different at the current width, published by the
   * same observer. It is the grid that knows its width and its gap, and the
   * size slider that needs the answer.
   */
  const sizeStops = ref<number[]>([]);

  /**
   * What the grid actually shows. Rename mode takes over the ordering — the
   * whole point is to arrange images into an order that sorting cannot express.
   */
  const displayed = computed(() =>
    rename.active.value ? rename.draft.value : gallery.sorted.value,
  );

  const selectedIndex = computed(() => gallery.selectedIndexIn(displayed.value));
  const selectedEntry = computed(() => displayed.value[selectedIndex.value] ?? null);
  /** The whole selection, in grid order — which is the order a delete or a drag wants. */
  const selectedEntries = computed(() => gallery.selectedEntriesIn(displayed.value));

  async function openFolder(): Promise<void> {
    await guard.attempt(async () => {
      await adopt(await source.open());
    });
  }

  async function adopt(port: FileSystemPort | null): Promise<void> {
    if (!port) return;
    rename.cancel();
    rename.clearUndo();
    await gallery.open(port);
  }

  function closeFolder(): void {
    void guard.attempt(() => {
      rename.cancel();
      rename.clearUndo();
      gallery.close();
    });
  }

  // ---------------------------------------------------------------- selection

  function moveSelectionBy(direction: MoveDirection, extend = false): void {
    gallery.moveBy(direction, columns.value, displayed.value, extend);
  }

  // ------------------------------------------------------------------ arrange

  /**
   * Nudge the whole selection along the grid, entering rename mode on the first
   * press the way the first drag of a tile does.
   *
   * A scattered selection is gathered into one run, so repeated presses move an
   * arrangement rather than dealing the photos out one at a time. Where that run
   * starts from is the cursor: it is the photo the arrows have been moving, and
   * so the one the eye is following.
   */
  function nudgeSelection(delta: number): void {
    // Before entering rename mode, not after: nothing selected is nothing to
    // arrange, and opening a session first puts the rename bar up over a press
    // that could not have moved anything.
    if (selectedEntries.value.length === 0) return;
    if (!rename.active.value) enterRename();

    const list = displayed.value;
    // Re-read: entering rename mode swaps `displayed` to the draft, and the run
    // has to be the entries in the list the move is about to be made against.
    const run = selectedEntries.value;

    const first = list.indexOf(run[0]!);
    const contiguous = run.every((entry, at) => list[first + at] === entry);
    const last = list.length - run.length;
    const from = contiguous ? first : clamp(selectedIndex.value, 0, last);

    const to = clamp(from + delta, 0, last);
    if (contiguous && to === from) return;
    rename.moveRun(run, to);
  }

  function openLargeView(): void {
    if (selectedEntry.value) gallery.view.value = "large";
  }

  function closeLargeView(): void {
    gallery.view.value = "grid";
  }

  // ------------------------------------------------------------------- delete

  function askToDelete(entries: ImageEntry[] = selectedEntries.value): void {
    if (entries.length === 0) return;
    pendingDeletes.value = entries;
    deleteDialogOpen.value = true;
  }

  async function confirmDelete(): Promise<void> {
    const entries = pendingDeletes.value;
    deleteDialogOpen.value = false;
    pendingDeletes.value = [];
    if (entries.length === 0) return;

    const names = entries.map((entry) => entry.name);
    busy.value = true;
    // Cleared up front so the banner always describes this attempt rather than
    // leaving the previous failure standing over a delete that then worked.
    gallery.error.value = null;
    try {
      // Shrink the tiles out first, then drop them from the list so the
      // survivors animate into the gap rather than snapping shut around
      // vanished cells. One wait for the whole selection, not one each.
      gallery.removingNames.value = new Set(names);
      await wait(motion.duration(REMOVE_DURATION));
      await gallery.removeMany(names, displayed.value);
      if (rename.active.value) for (const name of names) rename.forget(name);

      // Deleting the last image leaves the large view with nothing to show.
      if (displayed.value.length === 0) gallery.view.value = "grid";
    } catch (cause) {
      gallery.error.value = describeDeleteFailure(cause, names, gallery.entries.value);
    } finally {
      gallery.removingNames.value = new Set();
      busy.value = false;
    }
  }

  /**
   * A delete failure has to name files. `removeMany` deletes everything it can
   * and raises only the first failure, so the grid is left showing some of what
   * you asked to go and none of why — and the reason alone ("Permission denied")
   * does not say which. What is still listed is the honest answer.
   */
  function describeDeleteFailure(
    cause: unknown,
    attempted: string[],
    remaining: ImageEntry[],
  ): string {
    const still = new Set(remaining.map((entry) => entry.name));
    const kept = attempted.filter((name) => still.has(name));
    const subject = kept.length > 0 ? kept : attempted;
    const reason = cause instanceof Error ? cause.message : "the disk refused it";
    return `Could not delete ${subject.join(", ")} — ${reason}.`;
  }

  // -------------------------------------------------------- rename one file

  /**
   * The photo a single rename would act on.
   *
   * In the large view that is the cursor, because one photo is all there is on
   * screen; in the grid it is a selection of exactly one, since renaming one
   * file has nothing to say about a selection of ten — that is what the bulk
   * session beside it is for.
   */
  const renameSubject = computed<ImageEntry | null>(() => {
    if (gallery.view.value === "large") return selectedEntry.value;
    return selectedEntries.value.length === 1 ? selectedEntries.value[0]! : null;
  });

  const canRename = computed(
    () =>
      renameSubject.value !== null && !rename.active.value && !rename.applying.value && !busy.value,
  );

  function askToRename(): void {
    if (!canRename.value) return;
    pendingRename.value = renameSubject.value;
    renameDialogOpen.value = true;
  }

  /**
   * Renames the file the dialog was opened for. The typed name is re-planned
   * here rather than trusted from the dialog: `allNames` is live, and the folder
   * can gain a colliding file while the dialog stands open.
   */
  async function confirmRename(base: string): Promise<void> {
    const entry = pendingRename.value;
    renameDialogOpen.value = false;
    pendingRename.value = null;
    if (!entry) return;

    const plan = planSingleRename(entry, base, gallery.allNames.value);
    const to = plan.changes[0]?.to;
    if (!plan.valid || to === undefined) return;

    busy.value = true;
    try {
      if (await rename.renameOne(entry.name, to)) {
        // `refresh()` drops selected names that no longer exist, and after this
        // rename that is the file itself. Put the selection on where it went.
        gallery.select(to);
        gallery.notice.value = `Renamed ${entry.name} to ${to}.`;
      } else {
        // The rename bar is the only thing that shows `rename.failure`, and it is
        // not up outside a session — so a failure here has to reach the banner.
        gallery.error.value = rename.failure.value ?? `Could not rename ${entry.name}.`;
      }
    } finally {
      busy.value = false;
    }
  }

  // ------------------------------------------------------------------- rename

  function enterRename(): void {
    rename.begin(displayed.value);
  }

  /** Escape out of rename mode — via the discard dialog if there is work to lose. */
  function exitRename(): void {
    if (!rename.active.value) return;
    void guard.attempt(() => rename.cancel());
  }

  /**
   * Applying closes the session, so the grid stops showing the draft and starts
   * showing the sort again. Sorting by name is what makes that the same picture:
   * the rename numbered the files in the arranged order, so name order *is* the
   * arrangement — under any other sort the photos would jump out of the order
   * that was the whole point of renaming them.
   */
  async function applyRename(): Promise<void> {
    // Read before the run: the plan is rebuilt against the refreshed entries the
    // moment their names change underneath it.
    const count = rename.plan.value.changes.length;
    if (!(await rename.apply())) return;

    gallery.sort.value = { field: "name", direction: "asc" };
    gallery.notice.value = `Renamed ${count} file${count === 1 ? "" : "s"}.`;
  }

  async function undoRename(): Promise<void> {
    if (!(await rename.undo())) return;
    gallery.notice.value = "Put every original name back.";
  }

  return {
    supported,
    gallery,
    rename,
    guard,
    motion,
    columns,
    sizeStops,
    displayed,
    selectedIndex,
    selectedEntry,
    selectedEntries,
    pendingDeletes,
    deleteDialogOpen,
    pendingRename,
    renameDialogOpen,
    canRename,
    busy,
    hasFolder: computed(() => gallery.port.value !== null),
    openFolder,
    closeFolder,
    moveSelectionBy,
    nudgeSelection,
    openLargeView,
    closeLargeView,
    askToDelete,
    confirmDelete,
    cancelDelete: () => {
      deleteDialogOpen.value = false;
    },
    askToRename,
    confirmRename,
    cancelRename: () => {
      renameDialogOpen.value = false;
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
