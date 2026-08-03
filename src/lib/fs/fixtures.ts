/**
 * Real image bytes for tests and the Playwright harness.
 *
 * MUST NOT be imported from `src/main.ts` — like `memory-adapter.ts`, keeping it
 * out of the entry graph is what keeps it out of the production bundle.
 *
 * Both are 64x64 rather than 1x1, because a one-pixel image renders as one pixel
 * and is indistinguishable on screen from an image that failed to load, so a test
 * against it proves nothing.
 */

function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** A 64x64 PNG. Stands in for any format the browser draws by itself. */
export const PNG_64 = bytesOf(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfHEPZPYRhD+HEIgwW4zVn764YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQwg8HFgABc6zLrQAAAABJRU5ErkJggg==",
);

/**
 * A 64x64 HEIC, encoded by macOS `sips`. Chrome cannot draw this at all; getting
 * it on screen exercises the whole libheif worker path.
 */
export const HEIC_64 = bytesOf(
  "AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAA" +
    "AAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAA" +
    "AQAAABVpbmZlAgAAAAABAABodmMxAAAAAOVpcHJwAAAAxGlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAA" +
    "FGlzcGUAAAAAAAAAQAAAAEAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcGh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAAL" +
    "A6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAIkIBAQNwAAADALAAAAMAAAMAHqAUIEHBj4h7kWVTcCAgYAiiAAEA" +
    "CUQBwGPLIQFMkAAAABlpcG1hAAAAAAAAAAEAAQaBAgOEBYYAAAAeaWxvYwAAAABEAAABAAEAAAABAAABuQAABz4AAAABbWRh" +
    "dAAAAAAAAAdOAAAHOigBr6FeHMjy2v9dnVlv+LTudcMs4qlu1rRHKivbb6fXdwxtEoKHVndVAgHf+ToZOnC3quEr/IJTs33D" +
    "Ag6sIfQvWacss0RFXz4ZhLC5EuY7A6l8BD4+bEXhhk0/g/J59D0cC41taQEdNvsvc8iWyM7qeeRdpdDR54NVy+6MAC+sSglX" +
    "MrkDh75grYwcvCDaXffo/OI3+X3VuChPGL0nqS2sQP9Y4IrRW0gDvLK7fMaI91UcpXqekFVN5n8DQhFbr5L18qBSSE//Huia" +
    "9TSSR5Mh3ejJ/laRbDOzzReGt8jYXsWId0ltuybTNE7DGL6U2GdgnN+2ExPoQVuV+Bozj+BeMJrAKY1FV44Bm8ckuf4C5vvy" +
    "7S3lT2rWvTFe9A0/WJ9+hXQztyaar2aMJo7wgcilcS3dqfgyay+aQ8LoMJ3JVfstQIZIfMc5qziqTLhXtufXJv/9dDrmEdvx" +
    "aQYQ/sZLlQc4SrLDxetL1MZxzmW6o/akPmiVKIZa+rNqTJ/3JvL2Y8ShIEvwyWJqN3G5AzSK84TfLFePANqgpHKI7o219K9t" +
    "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",
);

/**
 * The same 64x64 HEIC carrying EXIF: `DateTimeOriginal` 2019-11-02 18:44:01 at
 * `OffsetTimeOriginal` +09:00, so 2019-11-02T09:44:01Z.
 *
 * Real bytes off `exiftool` rather than a hand-built approximation, because the
 * ISO-BMFF path is the intricate one — the date is an item in its own right,
 * described by `iinf` and placed by `iloc` — and a fixture written to match the
 * parser would only prove the parser agrees with itself.
 */
export const HEIC_64_DATED = bytesOf(
  "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",
);

/** A 64x64 JPEG. The base `jpegWithDateTaken` stamps a date onto. */
export const JPEG_64 = bytesOf(
  "/9j/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAA" +
    "F9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
    "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+" +
    "Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC" +
    "AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZG" +
    "VmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn" +
    "6Onq8vP09fb3+Pn6/9sAQwAJCQkJCQkQCQkQFhAQEBYeFhYWFh4mHh4eHh4mLiYmJiYmJi4uLi4uLi4uNzc3Nzc3QEBAQEBISE" +
    "hISEhISEhI/9sAQwELDAwSERIfEREfSzMqM0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tL" +
    "S0tL/90ABAAE/9oADAMBAAIRAxEAPwDDooorgP0AKKKKACiiigAooooA/9DDooorgP0AKKKKACiiigAooooA/9HDooorgP0AKK" +
    "KKACiiigAooooA/9LDooorgP0AKKKKACiiigAooooA/9k=",
);

/**
 * `JPEG_64` with an EXIF date stamped into an APP1 segment.
 *
 * Spliced into a real JPEG rather than assembled from scratch so the result
 * still draws — a fixture that parses but shows "No preview" would quietly turn
 * every tile in an e2e run into a broken one.
 */
export function jpegWithDateTaken(
  wallClock: string,
  options: { offset?: string } = {},
): Uint8Array {
  const date = `${wallClock}\0`;
  const offset = options.offset === undefined ? "" : `${options.offset}\0`;
  const entries = offset === "" ? 1 : 2;

  // IFD0 holds one entry pointing at the Exif IFD; the dates live in that.
  const exifIfdAt = 8 + 2 + 12 + 4;
  const valuesAt = exifIfdAt + 2 + 12 * entries + 4;
  const tiff = new Uint8Array(valuesAt + date.length + offset.length);
  const view = new DataView(tiff.buffer);

  view.setUint16(0, 0x4d4d); // big-endian, as Apple writes it
  view.setUint16(2, 42);
  view.setUint32(4, 8);

  view.setUint16(8, 1);
  writeEntry(view, 10, 0x8769, 4, 1, exifIfdAt); // ExifIFDPointer
  view.setUint32(22, 0); // no IFD1

  view.setUint16(exifIfdAt, entries);
  writeEntry(view, exifIfdAt + 2, 0x9003, 2, date.length, valuesAt); // DateTimeOriginal
  if (offset !== "") {
    // OffsetTimeOriginal
    writeEntry(view, exifIfdAt + 14, 0x9011, 2, offset.length, valuesAt + date.length);
  }
  view.setUint32(exifIfdAt + 2 + 12 * entries, 0);

  writeAscii(tiff, valuesAt, date);
  writeAscii(tiff, valuesAt + date.length, offset);

  // APP1 goes straight after SOI, where every decoder looks for it first.
  const app1 = 2 + 6 + tiff.length;
  const bytes = new Uint8Array(JPEG_64.length + 2 + app1);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, app1 >> 8, app1 & 0xff], 0);
  writeAscii(bytes, 6, "Exif\0\0");
  bytes.set(tiff, 12);
  bytes.set(JPEG_64.subarray(2), 12 + tiff.length);
  return bytes;
}

function writeEntry(
  view: DataView,
  at: number,
  tag: number,
  type: number,
  count: number,
  value: number,
): void {
  view.setUint16(at, tag);
  view.setUint16(at + 2, type);
  view.setUint32(at + 4, count);
  view.setUint32(at + 8, value);
}

function writeAscii(bytes: Uint8Array, at: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
}

/** `File` for one of the above, ready for an `ImageEntry.getFile()`. */
export function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}
