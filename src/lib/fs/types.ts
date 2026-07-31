/**
 * The one seam between Aperture and the disk.
 *
 * Everything above this interface — the rename engine, the gallery, the
 * components — is testable in plain Node against `MemoryAdapter`, and the
 * awkward parts of the File System Access API stay confined to `FsaAdapter`.
 */

export interface ImageEntry {
  /** Full filename including extension, e.g. `IMG_0042.jpg`. */
  name: string;
  /** Filename without its extension, e.g. `IMG_0042`. */
  base: string;
  /** Extension including the leading dot, e.g. `.jpg`. Empty if there is none. */
  ext: string;
  size: number;
  lastModified: number;
  getFile(): Promise<File>;
}

export interface FileSystemPort {
  /** Folder name, shown in the toolbar. */
  readonly label: string;

  /** Images only, unsorted. */
  list(): Promise<ImageEntry[]>;

  /**
   * Every entry in the folder, images or not. The rename planner needs this:
   * a target name colliding with a spreadsheet sitting alongside the photos is
   * just as destructive as one colliding with another image.
   */
  listAllNames(): Promise<string[]>;

  /** Permanent. Does not move the file to the Trash. */
  delete(name: string): Promise<void>;

  /** Overwrites `to` if it already exists, matching the underlying API. */
  rename(from: string, to: string): Promise<void>;

  /**
   * Resolve to `true` once we hold readwrite access. Must be called from a user
   * gesture — permission does not survive closing every tab of the origin.
   */
  ensurePermission(): Promise<boolean>;
}

/** Thrown when a rename or delete fails, naming the file that caused it. */
export class FileOperationError extends Error {
  // Written out longhand rather than as constructor parameter properties, which
  // `erasableSyntaxOnly` disallows.
  readonly fileName: string;

  constructor(message: string, fileName: string, cause?: unknown) {
    super(message, { cause });
    this.name = "FileOperationError";
    this.fileName = fileName;
  }
}
