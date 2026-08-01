import decodeHeicImage, { type DecodedImage } from "heic-decode";
import { previewSize, PREVIEW_QUALITY, PREVIEW_TYPE } from "./preview-format";
import type { HeicWorkerRequest, HeicWorkerResponse } from "./protocol";

/**
 * The HEIC decoder, off the main thread.
 *
 * This module is the only place `heic-decode` is imported, which is what keeps
 * libheif — 1.5 MB of wasm, half a megabyte gzipped — in a chunk of its own that
 * a folder of JPEGs never downloads.
 *
 * It has to run in a worker rather than an idle callback: libheif is a
 * synchronous wasm decode, and a 12 MP photo off an iPhone takes roughly 600 ms
 * of solid CPU. On the main thread that is six dropped frames per thumbnail.
 */

/**
 * Shrink to something a screen can use and re-encode.
 *
 * The decoded RGBA of a 12 MP photo is 46 MB — two of those outstanding is more
 * memory than the whole rest of the app — so the full-size pixels are turned
 * into a ~250 KB JPEG here and dropped before the reply is posted. Resizing
 * inside `createImageBitmap` rather than by drawing full-size to a canvas means
 * the big buffer is never copied into a second one.
 */
async function toPreviewBlob(image: DecodedImage): Promise<Blob> {
  const { width, height } = previewSize(image.width, image.height);

  const source = new ImageData(image.data, image.width, image.height);
  const bitmap = await createImageBitmap(source, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });

  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not get a 2D context for the preview.");
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: PREVIEW_TYPE, quality: PREVIEW_QUALITY });
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<HeicWorkerRequest>) => {
  const { id, bytes } = event.data;

  const reply = (message: HeicWorkerResponse) => {
    (self as unknown as Worker).postMessage(message);
  };

  try {
    const image = await decodeHeicImage({ buffer: new Uint8Array(bytes) });
    reply({ id, ok: true, blob: await toPreviewBlob(image) });
  } catch (cause) {
    reply({
      id,
      ok: false,
      message: cause instanceof Error ? cause.message : "Could not decode this HEIC file.",
    });
  }
};
