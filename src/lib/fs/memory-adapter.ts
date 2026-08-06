import { readDateTakenIn } from "@/lib/exif";
import { isImageName, splitName } from "@/lib/file-names";
import { FileOperationError, type FileSystemPort, type ImageEntry } from "./types";

/**
 * In-memory `FileSystemPort` for tests and the Playwright harness.
 *
 * MUST NOT be imported from `src/main.ts` — keeping it out of the entry graph is
 * what keeps it out of the production bundle.
 */

export interface MemoryFile {
  name: string;
  bytes?: Uint8Array;
  type?: string;
  lastModified?: number;
}

interface StoredFile {
  bytes: Uint8Array;
  type: string;
  lastModified: number;
}

export interface MemoryAdapterOptions {
  label?: string;
  /** Start denied, so `ensurePermission()` has to be called to unlock writes. */
  permission?: boolean;
  /**
   * Called before every rename. Throw to simulate a mid-flight disk failure —
   * this is how rollback gets tested.
   */
  beforeRename?: (from: string, to: string) => void;
  /** The same affordance for deletes, which fail for their own reasons: a file
   *  open in another app, a folder whose permission has lapsed. */
  beforeDelete?: (name: string) => void;
}

export class MemoryAdapter implements FileSystemPort {
  readonly label: string;
  private readonly files = new Map<string, StoredFile>();
  private permission: boolean;
  private readonly beforeRename?: (from: string, to: string) => void;
  private readonly beforeDelete?: (name: string) => void;

  /** Every rename this adapter has performed, oldest first. Test affordance. */
  readonly renameLog: Array<{ from: string; to: string }> = [];

  constructor(files: Array<MemoryFile | string> = [], options: MemoryAdapterOptions = {}) {
    this.label = options.label ?? "Photos";
    this.permission = options.permission ?? true;
    this.beforeRename = options.beforeRename;
    this.beforeDelete = options.beforeDelete;

    let clock = 1_700_000_000_000;
    for (const file of files) {
      const spec: MemoryFile = typeof file === "string" ? { name: file } : file;
      this.files.set(spec.name, {
        bytes: spec.bytes ?? new Uint8Array([1, 2, 3]),
        type: spec.type ?? "image/jpeg",
        // Distinct, ascending timestamps so date sorting is deterministic.
        lastModified: spec.lastModified ?? (clock += 1000),
      });
    }
  }

  /** Current folder contents as `name -> bytes`. Test affordance. */
  snapshot(): Record<string, Uint8Array> {
    return Object.fromEntries([...this.files].map(([name, file]) => [name, file.bytes]));
  }

  /** Filenames in insertion order. Test affordance. */
  names(): string[] {
    return [...this.files.keys()];
  }

  async list(): Promise<ImageEntry[]> {
    return [...this.files]
      .filter(([name]) => isImageName(name))
      .map(([name, file]) => this.toEntry(name, file));
  }

  async listAllNames(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async delete(name: string): Promise<void> {
    this.assertWritable(name);
    this.beforeDelete?.(name);
    if (!this.files.has(name)) {
      throw new FileOperationError(`No such file: ${name}`, name);
    }
    this.files.delete(name);
  }

  async rename(from: string, to: string): Promise<void> {
    this.assertWritable(from);
    this.beforeRename?.(from, to);

    const file = this.files.get(from);
    if (!file) {
      throw new FileOperationError(`No such file: ${from}`, from);
    }
    if (from === to) return;

    this.files.delete(from);
    this.files.set(to, file);
    this.renameLog.push({ from, to });
  }

  async ensurePermission(): Promise<boolean> {
    this.permission = true;
    return true;
  }

  private assertWritable(name: string): void {
    if (!this.permission) {
      throw new FileOperationError("Permission denied", name);
    }
  }

  private toEntry(name: string, file: StoredFile): ImageEntry {
    const { base, ext } = splitName(name);
    return {
      name,
      base,
      ext,
      size: file.bytes.byteLength,
      lastModified: file.lastModified,
      // Parsed from the bytes rather than taken as a parameter, so a spec that
      // wants a date has to hand over a file that genuinely carries one.
      dateTaken: readDateTakenIn(file.bytes),
      getFile: async () =>
        new File([file.bytes as unknown as BlobPart], name, {
          type: file.type,
          lastModified: file.lastModified,
        }),
    };
  }
}
