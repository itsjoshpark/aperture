import { HEIC_64, PNG_64 } from "@/lib/fs/fixtures";
import { MemoryAdapter, type MemoryFile } from "@/lib/fs/memory-adapter";
import type { FolderSource } from "@/lib/fs/folder-source";
import type { FileSystemPort } from "@/lib/fs/types";
import { createApertureApp } from "@/mount";

/**
 * Test-only entry point.
 *
 * Mounts the real `App.vue` against an in-memory folder so Playwright can drive
 * the whole app — a browser will not let a script open the file picker, and
 * mocking the File System Access API well enough to be worth testing against is
 * more work than implementing it.
 *
 * This file is not referenced from `src/main.ts` and has its own HTML entry, so
 * `MemoryAdapter` never reaches the production bundle.
 */

declare global {
  interface Window {
    /** Read by the tests to assert on what actually landed "on disk". */
    __aperture: {
      names: () => string[];
      renameLog: () => Array<{ from: string; to: string }>;
    };
  }
}

/**
 * Real bytes matched to the extension, so a `.heic` in a spec is genuinely a
 * HEIC — the whole point of that test is that Chrome cannot draw it and libheif
 * has to.
 */
function contentFor(name: string): { bytes: Uint8Array; type: string } {
  return /\.heic$|\.heif$/i.test(name)
    ? { bytes: HEIC_64, type: "image/heic" }
    : { bytes: PNG_64, type: "image/png" };
}

function seedFiles(): MemoryFile[] {
  const params = new URLSearchParams(window.location.search);

  const names = params.get("files")?.split(",").filter(Boolean) ?? [
    "beach.jpg",
    "sunset.jpg",
    "dog.jpg",
    "harbour.jpg",
    "market.jpg",
    "trail.jpg",
  ];

  return names.map((name, index) => ({
    name,
    ...contentFor(name),
    lastModified: 1_700_000_000_000 + index * 60_000,
  }));
}

const adapter = new MemoryAdapter(seedFiles(), { label: "Test Folder" });

const source: FolderSource = {
  open: async (): Promise<FileSystemPort | null> => adapter,
  lastName: async () => null,
  reopen: async () => null,
  forget: async () => {},
};

window.__aperture = {
  names: () => adapter.names(),
  renameLog: () => [...adapter.renameLog],
};

createApertureApp({ source, supported: true }).mount("#app");
