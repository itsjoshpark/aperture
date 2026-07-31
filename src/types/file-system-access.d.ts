/**
 * The parts of the File System Access API that TypeScript's DOM library still
 * does not ship. All Chromium-only.
 *
 * `move()` is declared here because we *attempt* it — it is shipped for OPFS
 * files and sits behind a flag for anything picked from the local disk, so at
 * runtime it may be missing entirely or present-and-throwing. `FsaAdapter`
 * treats both as "fall back to copy + delete".
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
