import { HEIC_64, jpegWithDateTaken, PNG_64 } from "@/lib/fs/fixtures";
import { MemoryAdapter, type MemoryFile } from "@/lib/fs/memory-adapter";
import type { FolderSource } from "@/lib/fs/folder-source";
import { FileOperationError, type FileSystemPort } from "@/lib/fs/types";
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
 *
 * `taken` puts a real EXIF date in the bytes rather than alongside them, so the
 * app has to read one to sort by it.
 */
function contentFor(name: string, taken?: string): { bytes: Uint8Array; type: string } {
  if (/\.heic$|\.heif$/i.test(name)) return { bytes: HEIC_64, type: "image/heic" };
  if (taken) return { bytes: jpegWithDateTaken(taken), type: "image/jpeg" };
  return { bytes: PNG_64, type: "image/png" };
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

  // `?taken` dates the files backwards, so date taken, date modified and name
  // each give a different order and a spec cannot pass by accident.
  const dated = params.has("taken");

  return names.map((name, index) => ({
    name,
    ...contentFor(name, dated ? takenAt(names.length - index) : undefined),
    lastModified: 1_700_000_000_000 + index * 60_000,
  }));
}

/** An EXIF timestamp `minutes` into 2019-11-02, as `DateTimeOriginal` spells it. */
function takenAt(minutes: number): string {
  return `2019:11:02 ${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}:00`;
}

/**
 * `?failDelete=a.jpg,b.jpg` makes those deletes fail the way a real one does —
 * a file held open by another app, a permission that lapsed. There is no other
 * way to reach the app's failure path from a test: the disk under a real folder
 * does what it likes, and the in-memory one always succeeds.
 */
function failingDeletes(): ((name: string) => void) | undefined {
  const doomed = new URLSearchParams(window.location.search).get("failDelete");
  if (!doomed) return undefined;

  const names = new Set(doomed.split(",").filter(Boolean));
  return (name: string) => {
    if (names.has(name)) throw new FileOperationError("Permission denied", name);
  };
}

const adapter = new MemoryAdapter(seedFiles(), {
  label: "Test Folder",
  beforeDelete: failingDeletes(),
});

const source: FolderSource = {
  open: async (): Promise<FileSystemPort | null> => adapter,
};

window.__aperture = {
  names: () => adapter.names(),
  renameLog: () => [...adapter.renameLog],
};

createApertureApp({ source, supported: true }).mount("#app");
