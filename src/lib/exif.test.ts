import { describe, expect, it } from "vite-plus/test";
import { EXIF_PREFIX_BYTES, locateExif, readDateTakenFrom, readDateTakenIn } from "./exif";
import { HEIC_64, HEIC_64_DATED, jpegWithDateTaken, PNG_64 } from "./fs/fixtures";

const blobOf = (bytes: Uint8Array) => new Blob([bytes as unknown as BlobPart]);

/** The epoch a local wall clock lands on, whatever timezone the test runs in. */
const localEpoch = (wallClock: string) => Date.parse(wallClock);

describe("readDateTakenIn", () => {
  it("reads a JPEG's DateTimeOriginal out of its APP1 segment", () => {
    const date = readDateTakenIn(jpegWithDateTaken("2019:11:02 18:44:01"));

    expect(date?.wallClock).toBe("2019-11-02T18:44:01");
    expect(date?.epoch).toBe(localEpoch("2019-11-02T18:44:01"));
  });

  it("applies OffsetTimeOriginal when the file records one", () => {
    const date = readDateTakenIn(jpegWithDateTaken("2019:11:02 18:44:01", { offset: "+09:00" }));

    expect(date?.offsetMinutes).toBe(540);
    expect(new Date(date!.epoch).toISOString()).toBe("2019-11-02T09:44:01.000Z");
  });

  it("handles a negative offset", () => {
    const date = readDateTakenIn(jpegWithDateTaken("2021:07:04 09:15:23", { offset: "-04:00" }));

    expect(date?.offsetMinutes).toBe(-240);
    expect(new Date(date!.epoch).toISOString()).toBe("2021-07-04T13:15:23.000Z");
  });

  it("falls back to local time when there is no offset", () => {
    const date = readDateTakenIn(jpegWithDateTaken("2019:11:02 18:44:01"));

    expect(date?.offsetMinutes).toBeNull();
    expect(date?.epoch).toBe(localEpoch("2019-11-02T18:44:01"));
  });

  it("keeps the wall clock the camera wrote, whatever the offset", () => {
    const here = readDateTakenIn(jpegWithDateTaken("2019:11:02 18:44:01"));
    const abroad = readDateTakenIn(jpegWithDateTaken("2019:11:02 18:44:01", { offset: "+09:00" }));

    // The instants differ; the time on the shutter does not. A filename built
    // from this has to say 18:44 in both cases.
    expect(here?.wallClock).toBe("2019-11-02T18:44:01");
    expect(abroad?.wallClock).toBe("2019-11-02T18:44:01");
    expect(here?.epoch).not.toBe(abroad?.epoch);
  });

  it("reads a HEIC, whose EXIF is an item placed by iloc", () => {
    const date = readDateTakenIn(HEIC_64_DATED);

    expect(date?.wallClock).toBe("2019-11-02T18:44:01");
    expect(new Date(date!.epoch).toISOString()).toBe("2019-11-02T09:44:01.000Z");
  });

  it("returns null for images that carry no EXIF at all", () => {
    expect(readDateTakenIn(PNG_64)).toBeNull();
    expect(readDateTakenIn(HEIC_64)).toBeNull();
  });

  it("rejects the placeholder dates cameras write when they do not know", () => {
    expect(readDateTakenIn(jpegWithDateTaken("0000:00:00 00:00:00"))).toBeNull();
  });

  it("returns null rather than throwing on bytes that make no sense", () => {
    const jpeg = jpegWithDateTaken("2019:11:02 18:44:01");

    expect(readDateTakenIn(new Uint8Array(0))).toBeNull();
    expect(readDateTakenIn(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBeNull();
    expect(readDateTakenIn(jpeg.slice(0, 20))).toBeNull();
    expect(readDateTakenIn(new Uint8Array(64).fill(0xff))).toBeNull();
    expect(readDateTakenIn(HEIC_64_DATED.slice(0, 200))).toBeNull();
  });
});

describe("locateExif", () => {
  it("points into the bytes it was given when the EXIF is there", () => {
    expect(locateExif(jpegWithDateTaken("2019:11:02 18:44:01"))).toEqual({ at: 12 });
  });

  it("asks for a second read when iloc points past the prefix", () => {
    // Everything up to the end of the meta box, so the item can be located but
    // not read — which is the whole reason `readDateTakenFrom` reads twice.
    const found = locateExif(HEIC_64_DATED.slice(0, 486));

    expect(found).toEqual({ read: { offset: 502, length: 142 } });
  });

  it("finds nothing in a format that has no EXIF container", () => {
    expect(locateExif(PNG_64)).toBeNull();
  });
});

describe("readDateTakenFrom", () => {
  it("reads a file whose EXIF sits inside the first read", async () => {
    const blob = blobOf(jpegWithDateTaken("2019:11:02 18:44:01", { offset: "+09:00" }));

    expect((await readDateTakenFrom(blob))?.wallClock).toBe("2019-11-02T18:44:01");
  });

  it("reads a file whose EXIF item sits beyond the prefix", async () => {
    const blob = blobOf(withPaddedPayload(HEIC_64_DATED, EXIF_PREFIX_BYTES));

    // One read would have come back with the item's location and none of its
    // bytes; getting a date here means the second read happened.
    expect(blob.size).toBeGreaterThan(EXIF_PREFIX_BYTES);
    expect((await readDateTakenFrom(blob))?.wallClock).toBe("2019-11-02T18:44:01");
  });

  it("resolves to null for a file with nothing to read", async () => {
    expect(await readDateTakenFrom(blobOf(PNG_64))).toBeNull();
    expect(await readDateTakenFrom(new Blob([]))).toBeNull();
  });
});

/**
 * Pushes a HEIC's payload past `padding` bytes by inserting filler ahead of it
 * and moving every `iloc` offset along to match — the file stays valid, but its
 * EXIF item no longer lands in the first read.
 *
 * Tied to `HEIC_64_DATED`'s layout: one `iloc`, version 0, with 4-byte offsets.
 */
function withPaddedPayload(bytes: Uint8Array, padding: number): Uint8Array {
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mdatAt = 36 + source.getUint32(36); // past ftyp and meta
  const payloadAt = mdatAt + 16; // 8-byte header with a 64-bit largesize

  const padded = new Uint8Array(bytes.length + padding);
  padded.set(bytes.subarray(0, payloadAt), 0);
  padded.set(bytes.subarray(payloadAt), payloadAt + padding);

  const view = new DataView(padded.buffer);
  view.setBigUint64(mdatAt + 8, BigInt(Number(view.getBigUint64(mdatAt + 8)) + padding));
  for (const offsetAt of [464, 478]) {
    view.setUint32(offsetAt, view.getUint32(offsetAt) + padding);
  }
  return padded;
}
