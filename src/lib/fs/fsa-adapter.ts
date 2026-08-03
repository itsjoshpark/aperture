import { readDatesTaken } from "@/lib/exif";
import { isImageName, splitName } from "@/lib/file-names";
import { FileOperationError, type FileSystemPort, type ImageEntry } from "./types";

/** Chromium-only. Everything else gets `UnsupportedBrowser.vue`. */
export function isFileSystemAccessSupported(): boolean {
  return typeof globalThis.window?.showDirectoryPicker === "function";
}

/** Opens the OS folder picker. Must be called from a user gesture. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    // Asking for readwrite up front means one prompt covers browsing, deleting
    // and renaming, instead of a second prompt the first time you delete.
    return await window.showDirectoryPicker!({ id: "aperture", mode: "readwrite" });
  } catch (error) {
    // The user dismissing the picker is a normal outcome, not a failure.
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export class FsaAdapter implements FileSystemPort {
  /**
   * `move()` ships for OPFS files but is flag-gated for files picked off the
   * local disk, so it may be absent or present-and-throwing. We try it once and
   * remember the answer rather than paying a failed call per file.
   */
  private canMove = true;

  private readonly dir: FileSystemDirectoryHandle;

  /**
   * `allowMove: false` forces the copy-then-delete path. Tests need it: the
   * origin private file system supports `move()`, so without it the fallback —
   * which is what essentially every real rename uses, because `move()` is
   * flag-gated for picked folders — would never be exercised.
   */
  constructor(dir: FileSystemDirectoryHandle, options: { allowMove?: boolean } = {}) {
    this.dir = dir;
    this.canMove = options.allowMove ?? true;
  }

  get label(): string {
    return this.dir.name;
  }

  async list(): Promise<ImageEntry[]> {
    const files: Array<{ handle: FileSystemFileHandle; file: File }> = [];
    for await (const handle of this.dir.values()) {
      if (handle.kind !== "file" || !isImageName(handle.name)) continue;
      files.push({ handle, file: await handle.getFile() });
    }

    const dates = await readDatesTaken(files.map(({ file }) => file));

    return files.map(({ handle, file }, index) => {
      const { base, ext } = splitName(handle.name);
      return {
        name: handle.name,
        base,
        ext,
        size: file.size,
        lastModified: file.lastModified,
        dateTaken: dates[index] ?? null,
        getFile: () => handle.getFile(),
      };
    });
  }

  async listAllNames(): Promise<string[]> {
    const names: string[] = [];
    for await (const name of this.dir.keys()) names.push(name);
    return names;
  }

  async delete(name: string): Promise<void> {
    try {
      await this.dir.removeEntry(name);
    } catch (error) {
      throw new FileOperationError(`Could not delete ${name}`, name, error);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    if (from === to) return;

    if (this.canMove) {
      try {
        const handle = await this.dir.getFileHandle(from);
        if (typeof handle.move === "function") {
          await handle.move(to);
          return;
        }
        this.canMove = false;
      } catch {
        // Either the flag is off, or this Chromium build has no move() for local
        // files. Either way the fallback below is the only route; a genuine
        // failure (missing file, revoked permission) will surface from it.
        this.canMove = false;
      }
    }

    await this.copyThenDelete(from, to);
  }

  /**
   * The rename we almost always end up doing. It rewrites the file's bytes,
   * which is why renaming in Aperture resets date-modified. Contents — and so
   * EXIF — are byte-identical.
   */
  private async copyThenDelete(from: string, to: string): Promise<void> {
    let source: File;
    try {
      source = await (await this.dir.getFileHandle(from)).getFile();
    } catch (error) {
      throw new FileOperationError(`Could not read ${from}`, from, error);
    }

    try {
      const target = await this.dir.getFileHandle(to, { create: true });
      const writable = await target.createWritable();
      try {
        await writable.write(source);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
    } catch (error) {
      // The copy failed, so the original is still intact. Clear away whatever
      // partial target we may have created rather than leaving a stub behind.
      await this.dir.removeEntry(to).catch(() => {});
      throw new FileOperationError(`Could not write ${to}`, from, error);
    }

    try {
      await this.dir.removeEntry(from);
    } catch (error) {
      // The copy landed but the original survives, so the folder now holds both.
      // Say exactly that — a vague message here sends people hunting for a file
      // that is sitting right there.
      throw new FileOperationError(
        `Renamed to ${to}, but ${from} could not be removed. Both files are now in the folder.`,
        from,
        error,
      );
    }
  }

  async ensurePermission(): Promise<boolean> {
    const options = { mode: "readwrite" } as const;
    if ((await this.dir.queryPermission?.(options)) === "granted") return true;
    return (await this.dir.requestPermission?.(options)) === "granted";
  }
}
