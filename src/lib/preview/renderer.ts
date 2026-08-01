import { needsDecoding } from "@/lib/file-names";
import type { ImageEntry } from "@/lib/fs/types";
import { HeicDecoder } from "./heic-decoder";

/**
 * How a file becomes something an `<img>` can show.
 *
 * Most formats need nothing: a blob URL for the file on disk is a handle, not a
 * copy, so it costs no memory and Chrome decodes it lazily. HEIC has to be
 * decoded and re-encoded before it is any use, which produces a real in-memory
 * blob — hence `bytes`, which is what `ThumbnailCache` budgets against.
 */

export interface Preview {
  url: string;
  /** Memory this preview holds, or 0 when the URL only points at the file. */
  bytes: number;
}

export type PreviewRenderer = (entry: ImageEntry, signal: AbortSignal) => Promise<Preview>;

/** The no-decode path, and the default everywhere a renderer is optional. */
export async function objectUrlPreview(entry: ImageEntry): Promise<Preview> {
  return { url: URL.createObjectURL(await entry.getFile()), bytes: 0 };
}

export interface PreviewSource {
  render: PreviewRenderer;
  /** Tear down the decode pool. Safe to call when nothing was ever decoded. */
  dispose: () => void;
}

export function createPreviewSource(): PreviewSource {
  // Built on first HEIC, so a folder of JPEGs never spawns a worker.
  let decoder: HeicDecoder | null = null;

  const render: PreviewRenderer = async (entry, signal) => {
    if (!needsDecoding(entry.name)) return objectUrlPreview(entry);

    decoder ??= new HeicDecoder();
    const job = decoder.decode(await entry.getFile());
    signal.addEventListener("abort", job.cancel, { once: true });

    const blob = await job.promise;
    return { url: URL.createObjectURL(blob), bytes: blob.size };
  };

  return {
    render,
    dispose: () => {
      decoder?.dispose();
      decoder = null;
    },
  };
}
