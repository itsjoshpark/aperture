import { splitName } from "./file-names";
import { FileOperationError, type FileSystemPort } from "./fs/types";
import type { RenameStep } from "./naming";

/**
 * Applies a rename plan to disk without ever letting two files fight over a
 * name.
 *
 * The whole reason this module exists is that renaming in place is unsafe. Given
 * `1.jpg -> 2.jpg` and `2.jpg -> 1.jpg`, renaming in order silently destroys one
 * of them, because the underlying API overwrites. So every file goes to a unique
 * temporary name first, and only then to its target. Two passes over the folder
 * instead of one, and no ordering to reason about.
 */

/** Leading dot keeps these out of the way in Finder if a run is interrupted. */
export const TEMP_PREFIX = ".aperture-tmp-";

export interface RenameRecord {
  from: string;
  to: string;
}

export interface RenameProgress {
  completed: number;
  /** Two operations per file — the temp hop counts as real work. */
  total: number;
  /** The file currently being moved. */
  current: string;
}

export interface ExecuteRenameOptions {
  onProgress?: (progress: RenameProgress) => void;
  signal?: AbortSignal;
  /** Injectable so tests get deterministic temp names. */
  sessionId?: string;
}

export class RenameCancelledError extends Error {
  constructor() {
    super("Rename cancelled");
    this.name = "RenameCancelledError";
  }
}

function randomSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Runs `steps` and resolves with the records needed to undo them.
 *
 * On any failure — including cancellation — every rename already performed is
 * reversed, so the folder is left exactly as it was found. If the rollback
 * itself fails there is nothing further we can do, and the original error is
 * still what gets reported: it is the one that explains the state on disk.
 */
export async function executeRename(
  fs: FileSystemPort,
  steps: RenameStep[],
  options: ExecuteRenameOptions = {},
): Promise<RenameRecord[]> {
  const changes = steps.filter((step) => step.from !== step.to);
  if (changes.length === 0) return [];

  const sessionId = options.sessionId ?? randomSessionId();
  const total = changes.length * 2;
  const done: RenameRecord[] = [];
  let completed = 0;

  const move = async (from: string, to: string) => {
    if (options.signal?.aborted) throw new RenameCancelledError();
    options.onProgress?.({ completed, total, current: from });
    await fs.rename(from, to);
    done.push({ from, to });
    completed += 1;
    options.onProgress?.({ completed, total, current: to });
  };

  const temps = changes.map((step, index) => ({
    step,
    temp: `${TEMP_PREFIX}${sessionId}-${index}${splitName(step.to).ext}`,
  }));

  // Whichever file the user would recognise from the preview list. During the
  // second pass the file is sitting under a temp name, and reporting
  // ".aperture-tmp-8f3a-2.jpg" back to them would be useless.
  let attempting = changes[0]!.from;

  try {
    for (const { step, temp } of temps) {
      attempting = step.from;
      await move(step.from, temp);
    }
    for (const { step, temp } of temps) {
      attempting = step.from;
      await move(temp, step.to);
    }
  } catch (error) {
    await rollback(fs, done);
    throw asFileOperationError(error, attempting);
  }

  return changes.map((step) => ({ from: step.from, to: step.to }));
}

/** Reverses completed moves, newest first. Best-effort by definition. */
async function rollback(fs: FileSystemPort, done: RenameRecord[]): Promise<void> {
  for (const record of [...done].reverse()) {
    await fs.rename(record.to, record.from).catch(() => {});
  }
}

function asFileOperationError(error: unknown, fileName: string): unknown {
  if (error instanceof RenameCancelledError) return error;

  if (error instanceof FileOperationError) {
    // The adapter names whatever it was handed, which during the second pass is
    // a temp file. Re-point it at the name the user knows.
    if (!error.fileName.startsWith(TEMP_PREFIX)) return error;
    return new FileOperationError(error.message, fileName, error.cause);
  }

  return new FileOperationError(
    error instanceof Error ? error.message : "Rename failed",
    fileName,
    error,
  );
}

/**
 * Inverts a completed rename. The result is fed straight back through
 * `executeRename`, so restoring names that overlap the current ones is handled
 * by the same temp-name pass rather than a second, subtly different algorithm.
 */
export function buildUndoSteps(records: RenameRecord[]): RenameStep[] {
  return records.map((record) => ({
    from: record.to,
    to: record.from,
    changed: record.to !== record.from,
  }));
}

/**
 * Temp files that outlived the run that made them — only possible if the tab
 * died mid-rename. The UI offers to put them back.
 */
export function findLeftoverTempNames(names: string[]): string[] {
  return names.filter((name) => name.startsWith(TEMP_PREFIX));
}
