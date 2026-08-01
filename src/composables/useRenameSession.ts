import { computed, ref, shallowRef } from "vue";
import type { ImageEntry } from "@/lib/fs/types";
import { reorder } from "@/lib/grid-geometry";
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

  const plan = computed(() => buildRenamePlan(draft.value, options.value, allNamesInFolder.value));

  /**
   * Every name in the folder, images or not. Kept as a ref rather than read
   * on demand so the preview can flag a collision as you type.
   */
  const allNamesInFolder = shallowRef<string[]>([]);

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
   * Whether closing the tab would lose work. Note that having *applied* a rename
   * is not dirty — the files are already on disk; only an unapplied arrangement
   * is at risk.
   */
  const dirty = computed(
    () => active.value && !applying.value && (reordered.value || affixesTouched.value),
  );

  const canUndo = computed(() => undoRecords.value !== null && !applying.value);

  async function begin(order: ImageEntry[]): Promise<void> {
    if (active.value) return;
    active.value = true;
    draft.value = [...order];
    initialNames.value = order.map((entry) => entry.name);
    failure.value = null;
    allNamesInFolder.value = (await gallery.port.value?.listAllNames()) ?? [];
  }

  function move(from: number, to: number): void {
    draft.value = reorder(draft.value, from, to);
  }

  function setOrder(next: ImageEntry[]): void {
    draft.value = next;
  }

  /** Leaves rename mode and discards the arrangement. */
  function cancel(): void {
    active.value = false;
    draft.value = [];
    initialNames.value = [];
    options.value = { ...DEFAULT_RENAME_OPTIONS };
    progress.value = null;
    failure.value = null;
  }

  /** Leaves rename mode but keeps the undo record, so Undo stays available. */
  function finish(): void {
    active.value = false;
    draft.value = [];
    initialNames.value = [];
    progress.value = null;
  }

  async function apply(): Promise<boolean> {
    const port = gallery.port.value;
    if (!port || !plan.value.valid || plan.value.changes.length === 0) return false;

    return run(() => executeRename(port, plan.value.changes, { onProgress: onProgress }));
  }

  async function undo(): Promise<boolean> {
    const port = gallery.port.value;
    const records = undoRecords.value;
    if (!port || !records) return false;

    const ok = await run(() =>
      executeRename(port, buildUndoSteps(records), { onProgress: onProgress }),
    );
    if (ok) undoRecords.value = null;
    return ok;
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
      // Names are the thumbnail cache's keys and they have all just changed.
      gallery.thumbnails.clear();
      await gallery.refresh();
      undoRecords.value = records.length > 0 ? records : null;
      finish();
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
    move,
    setOrder,
    cancel,
    finish,
    apply,
    undo,
    clearUndo: () => {
      undoRecords.value = null;
    },
  };
}

export type RenameSession = ReturnType<typeof useRenameSession>;
