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
 * A real 64x64 PNG. Deliberately not a 1x1 pixel: a one-pixel image renders as
 * one pixel, which on screen is indistinguishable from an image that failed to
 * load — so tests against it can't tell the two apart.
 */
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfHEPZPYRhD+HEIgwW4zVn764YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQwg8HFgABc6zLrQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

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
    bytes: PIXEL,
    type: "image/png",
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
