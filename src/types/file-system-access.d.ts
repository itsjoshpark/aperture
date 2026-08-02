/**
 * The parts of the File System Access API that TypeScript's DOM library still
 * does not ship, because no browser has standardised them.
 *
 * `showDirectoryPicker()` and the permission pair are Chromium-only, and are
 * the only calls in `FsaAdapter` that are — the rest of the API is implemented
 * in Firefox 111+ and Safari 15.2+, just with nothing but the origin private
 * file system to point it at.
 *
 * `move()` is the odd one out: non-standard but widely implemented. It is
 * declared here because we *attempt* it — Chrome ships it for OPFS files and
 * sits it behind a flag for anything picked from the local disk, so at runtime
 * it may be missing entirely or present-and-throwing. `FsaAdapter` treats both
 * as "fall back to copy + delete". It goes on `FileSystemFileHandle` rather
 * than `FileSystemHandle` because that is where Chrome exposes it; directory
 * moves are not supported anywhere.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle {
  move?(name: string): Promise<void>;
  move?(parent: FileSystemDirectoryHandle, name?: string): Promise<void>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "pictures"
    | "videos"
    | "music";
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
