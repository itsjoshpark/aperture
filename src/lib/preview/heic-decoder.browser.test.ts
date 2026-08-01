import { afterEach, expect, test } from "vite-plus/test";
import { fileOf, HEIC_64 } from "@/lib/fs/fixtures";
import { DecodeCancelled, HeicDecoder } from "./heic-decoder";
import { PREVIEW_TYPE } from "./preview-format";

/**
 * Everything here needs a real browser: a module worker, `createImageBitmap`,
 * `OffscreenCanvas`, and a megabyte of wasm that actually runs. There is nothing
 * meaningful to assert about any of it in node.
 */

const heicFile = (name = "IMG_0042.heic") => fileOf(HEIC_64, name, "image/heic");

let decoder: HeicDecoder | null = null;

function decoderWith(limit?: number): HeicDecoder {
  decoder = new HeicDecoder(limit);
  return decoder;
}

afterEach(() => {
  decoder?.dispose();
  decoder = null;
});

/** Draw the blob to prove it is a real image and not merely some bytes. */
async function dimensionsOf(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

test("decodes a HEIC into a drawable JPEG", async () => {
  const blob = await decoderWith().decode(heicFile()).promise;

  expect(blob.type).toBe(PREVIEW_TYPE);
  expect(await dimensionsOf(blob)).toEqual({ width: 64, height: 64 });
});

test("rejects a file that is not a HEIC", async () => {
  const junk = new File(
    [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]) as unknown as BlobPart],
    "x.heic",
    {
      type: "image/heic",
    },
  );

  await expect(decoderWith().decode(junk).promise).rejects.toThrow();
});

test("survives a bad file and keeps decoding", async () => {
  // A worker that took itself out on the first corrupt photo in a folder would
  // leave every photo after it blank.
  const pool = decoderWith(1);
  const junk = new File([Uint8Array.from([9, 9, 9, 9]) as unknown as BlobPart], "bad.heic");

  await expect(pool.decode(junk).promise).rejects.toThrow();
  expect(await dimensionsOf(await pool.decode(heicFile()).promise)).toEqual({
    width: 64,
    height: 64,
  });
});

test("drops a job cancelled before it starts", async () => {
  // One worker, so the second job is definitely still queued.
  const pool = decoderWith(1);

  const first = pool.decode(heicFile("a.heic"));
  const second = pool.decode(heicFile("b.heic"));
  expect(pool.queued).toBe(1);

  second.cancel();
  expect(pool.queued).toBe(0);

  await expect(second.promise).rejects.toBeInstanceOf(DecodeCancelled);
  await expect(first.promise).resolves.toBeInstanceOf(Blob);
});

test("releases waiters when the pool is disposed", async () => {
  const pool = decoderWith(1);
  const queued = pool.decode(heicFile("a.heic"));
  const pending = queued.promise;

  pool.dispose();

  await expect(pending).rejects.toBeInstanceOf(DecodeCancelled);
});

test("runs more than one decode at a time", async () => {
  const pool = decoderWith(2);

  const blobs = await Promise.all([
    pool.decode(heicFile("a.heic")).promise,
    pool.decode(heicFile("b.heic")).promise,
    pool.decode(heicFile("c.heic")).promise,
  ]);

  expect(blobs).toHaveLength(3);
  for (const blob of blobs) expect(await dimensionsOf(blob)).toEqual({ width: 64, height: 64 });
});
