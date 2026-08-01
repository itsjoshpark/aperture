import { FsaAdapter, pickDirectory } from "./fsa-adapter";
import { forgetLastDirectory, loadLastDirectory, saveLastDirectory } from "./handle-store";
import type { FileSystemPort } from "./types";

/**
 * Where folders come from.
 *
 * Splitting this out from the app state is what lets the Playwright harness run
 * the real `App.vue` against an in-memory folder: the harness supplies a
 * different source, and nothing else in the app changes. It also keeps the
 * picker's quirks — the dismissal case, the permission re-grant — in one place.
 */
export interface FolderSource {
  /** Prompt for a folder. Resolves to null if the user dismisses the picker. */
  open(): Promise<FileSystemPort | null>;
  /** Display name of a folder we could reopen, if there is one. */
  lastName(): Promise<string | null>;
  /** Reopen the remembered folder, re-granting permission. Must be user-gestured. */
  reopen(): Promise<FileSystemPort | null>;
  forget(): Promise<void>;
}

export function createFsaFolderSource(): FolderSource {
  return {
    async open() {
      const handle = await pickDirectory();
      if (!handle) return null;
      await saveLastDirectory(handle);
      return new FsaAdapter(handle);
    },

    async lastName() {
      return (await loadLastDirectory())?.name ?? null;
    },

    async reopen() {
      const handle = await loadLastDirectory();
      if (!handle) return null;

      const adapter = new FsaAdapter(handle);
      // Permission does not survive closing every tab of the origin, so this
      // may prompt. It only works because the caller is inside a click.
      return (await adapter.ensurePermission()) ? adapter : null;
    },

    forget: forgetLastDirectory,
  };
}
