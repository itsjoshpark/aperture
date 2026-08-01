import { FsaAdapter, pickDirectory } from "./fsa-adapter";
import type { FileSystemPort } from "./types";

/**
 * Where folders come from.
 *
 * Splitting this out from the app state is what lets the Playwright harness run
 * the real `App.vue` against an in-memory folder: the harness supplies a
 * different source, and nothing else in the app changes. It also keeps the
 * picker's one quirk — the dismissal case — in a single place.
 *
 * Nothing is remembered between sessions. A handle would survive a reload but
 * its permission would not, so a restored folder still costs a click and a
 * prompt; that is not enough better than picking the folder again to be worth
 * holding a directory handle in IndexedDB.
 */
export interface FolderSource {
  /** Prompt for a folder. Resolves to null if the user dismisses the picker. */
  open(): Promise<FileSystemPort | null>;
}

export function createFsaFolderSource(): FolderSource {
  return {
    async open() {
      const handle = await pickDirectory();
      return handle ? new FsaAdapter(handle) : null;
    },
  };
}
