/**
 * The wire format between `heic-decoder.ts` and `heic-worker.ts`.
 *
 * Kept in its own module so the main thread can type its side of the
 * conversation without importing the worker — importing it would pull libheif
 * back into the main chunk, which is the one thing this whole arrangement is
 * for.
 */

export interface HeicWorkerRequest {
  id: number;
  /** Transferred, not copied — these are whole photos. */
  bytes: ArrayBuffer;
}

export type HeicWorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; message: string };
