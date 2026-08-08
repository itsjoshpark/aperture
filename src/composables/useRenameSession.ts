import { computed, ref, shallowRef } from "vue";
import type { ImageEntry } from "@/lib/fs/types";
import { gatherRun } from "@/lib/grid-geometry";
import { buildRenamePlan, DEFAULT_RENAME_OPTIONS, type RenameOptions } from "@/lib/naming";
import {
  buildUndoSteps,
  executeRename,
  type RenameProgress,
  type RenameRecord,
} from "@/lib/rename-engine";
import type { Gallery } from "./useGallery";

/**
 * Rename mode: the draft order, the affixes, and the apply/undo cycle.
 *
 * Entering happens implicitly — the first drag of a tile starts a session. That
 * is why `begin()` snapshots the order it found: leaving without applying has to
 * put the grid back exactly as it was.
 */
export function useRenameSession(gallery: Gallery) {
  const active = ref(false);
  const options = ref<RenameOptions>({ ...DEFAULT_RENAME_OPTIONS });

  /** The dragged order. Becomes the grid order while a session is active. */
  const draft = shallowRef<ImageEntry[]>([]);
  const initialNames = shallowRef<string[]>([]);

  const applying = ref(false);
  const progress = ref<RenameProgress | null>(null);
  const undoRecords = shallowRef<RenameRecord[] | null>(null);
  const failure = ref<string | null>(null);

  /**
   * The collision set is the gallery's live name list, not a copy taken when the
   * session opened: the folder keeps changing underneath an open session — you
   * can delete from inside it, and Finder is still there — and a name checked
   * against a stale listing is refused for a file that no longer exists.
   */
  const plan = computed(() => buildRenamePlan(draft.value, options.value, gallery.allNames.value));

  const reordered = computed(() =>
    draft.value.some((entry, index) => entry.name !== initialNames.value[index]),
  );

  const affixesTouched = computed(
    () =>
      options.value.prefix !== DEFAULT_RENAME_OPTIONS.prefix ||
      options.value.suffix !== DEFAULT_RENAME_OPTIONS.suffix ||
      options.value.startIndex !== DEFAULT_RENAME_OPTIONS.startIndex ||
      options.value.padding !== DEFAULT_RENAME_OPTIONS.padding,
  );

  /**
   * Whether closing the tab would lose work. Only an unapplied arrangement is at
   * risk: applying closes the session, so there is no state in which the files
   * are already on disk and a session is still standing over them.
   */
  const dirty = computed(
    () => active.value && !applying.value && (reordered.value || affixesTouched.value),
  );

  const canUndo = computed(() => undoRecords.value !== null && !applying.value);

  function begin(order: ImageEntry[]): void {
    if (active.value) return;
    active.value = true;
    draft.value = [...order];
    initialNames.value = order.map((entry) => entry.name);
    failure.value = null;
  }

  /** Move a whole selection, as one block, so that it begins at `to`. */
  function moveRun(run: ImageEntry[], to: number): void {
    draft.value = gatherRun(draft.value, run, to);
  }

  /**
   * Drop a file that was deleted while a session was open.
   *
   * The snapshot has to shrink too. Comparing the draft against a snapshot that
   * still holds the deleted name shifts every entry after it by one, so the
   * session would look rearranged — and prompt to discard changes — when all
   * that happened was a delete.
   */
  function forget(name: string): void {
    const at = draft.value.findIndex((entry) => entry.name === name);
    if (at === -1) return;

    draft.value = draft.value.filter((entry) => entry.name !== name);
    initialNames.value = initialNames.value.filter((_, index) => index !== at);
  }

  /** Leaves rename mode. The undo record, if any, survives on the toolbar. */
  function cancel(): void {
    active.value = false;
    draft.value = [];
    initialNames.value = [];
    options.value = { ...DEFAULT_RENAME_OPTIONS };
    progress.value = null;
    failure.value = null;
  }

  async function apply(): Promise<boolean> {
    const port = gallery.port.value;
    if (!port || !plan.value.valid || plan.value.changes.length === 0) return false;

    const ok = await run(() => executeRename(port, plan.value.changes, { onProgress }));
    if (!ok) return false;

    // The arrangement is on disk, so there is nothing left to arrange: the bar
    // closes, the size slider comes back, and what happened is said in the
    // message banner. The undo record outlives the session, on the toolbar.
    cancel();
    return true;
  }

  async function undo(): Promise<boolean> {
    const port = gallery.port.value;
    const records = undoRecords.value;
    if (!port || !records) return false;

    const ok = await run(() => executeRename(port, buildUndoSteps(records), { onProgress }));
    if (!ok) return false;

    undoRecords.value = null;
    // The folder is back to how it started, so there is nothing left to arrange.
    cancel();
    return true;
  }

  function onProgress(next: RenameProgress) {
    progress.value = next;
  }

  async function run(operation: () => Promise<RenameRecord[]>): Promise<boolean> {
    applying.value = true;
    failure.value = null;
    progress.value = null;

    try {
      const records = await operation();
      await gallery.refresh();
      undoRecords.value = records.length > 0 ? records : null;
      return true;
    } catch (cause) {
      failure.value = cause instanceof Error ? cause.message : "The rename failed.";
      await gallery.refresh();
      return false;
    } finally {
      applying.value = false;
      progress.value = null;
    }
  }

  return {
    active,
    options,
    draft,
    plan,
    dirty,
    canUndo,
    applying,
    progress,
    failure,
    reordered,
    begin,
    moveRun,
    forget,
    cancel,
    apply,
    undo,
    clearUndo: () => {
      undoRecords.value = null;
    },
  };
}

export type RenameSession = ReturnType<typeof useRenameSession>;
