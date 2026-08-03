/**
 * Reading the date a photo was taken out of its EXIF metadata.
 *
 * This matters because renaming rewrites the file's bytes — see `copyThenDelete`
 * in `fsa-adapter.ts` — so date-modified is reset by the very feature the app
 * exists for. EXIF is copied along with the rest of the contents, so date-taken
 * is the only date that still means anything after a rename.
 *
 * PURE, apart from `readDateTakenFrom`, which reads a `Blob`. No dependency: the
 * libraries for this are either JPEG-only (`exif-js` has no ISO-BMFF code at
 * all, so every HEIC comes back empty) or resolve the timestamp against the
 * viewer's timezone rather than the one in the file.
 *
 * Nothing here throws. Corrupt files, truncated prefixes and formats that were
 * never going to have EXIF all come back `null`, because a folder must open even
 * when something in it is broken.
 */

export interface DateTaken {
  /** Epoch ms, offset applied. For ordering. */
  epoch: number;
  /**
   * The wall clock the camera wrote, `2019-11-02T18:44:01`.
   *
   * Kept alongside `epoch` because a filename built from a photo's date has to
   * read as the time on the shutter, and deriving that from an epoch runs it
   * through whatever timezone the *viewer* is in — an hour out at home, a day
   * out for a photo taken abroad.
   */
  wallClock: string;
  /** From `OffsetTimeOriginal`. Null when the file did not record one. */
  offsetMinutes: number | null;
}

/**
 * How much of a file to read before looking for EXIF.
 *
 * Comfortably covers a JPEG's APP1 and the `meta` box of a HEIC, which Apple
 * writes about 4 KB in. Files that keep it further out are handled by the second
 * read `locateExif` asks for.
 */
export const EXIF_PREFIX_BYTES = 65_536;

/** Reads in flight at once while a folder opens. Bounded to spare the disk. */
const EXIF_READ_CONCURRENCY = 8;

/**
 * Where the TIFF header is: in the bytes we already hold, or at a range we still
 * have to go and read.
 */
export type ExifLocation = { at: number } | { read: { offset: number; length: number } };

const TAG_MODIFY_DATE = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_CREATE_DATE = 0x9004;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;

const TYPE_ASCII = 2;
const TYPE_LONG = 4;

// Box and marker names, as the big-endian uint32 they are on the wire.
const BOX_FTYP = 0x66747970;
const BOX_META = 0x6d657461;
const BOX_IINF = 0x69696e66;
const BOX_ILOC = 0x696c6f63;
const FOURCC_EXIF = 0x45786966;
const RIFF = 0x52494646;
const WEBP = 0x57454250;
const CHUNK_EXIF = 0x45584946;

const INTEL = 0x4949;
const MOTOROLA = 0x4d4d;

/**
 * Reads for a whole folder at once, a few at a time.
 *
 * Overlapping the reads is what keeps this off the critical path — 300 files
 * measured 42 ms this way against 99 ms one after another — while the cap stops
 * a big folder opening thousands of reads at once and thrashing the disk it is
 * trying to be quick about.
 */
export async function readDatesTaken(blobs: Blob[]): Promise<Array<DateTaken | null>> {
  const dates: Array<DateTaken | null> = Array.from({ length: blobs.length }, () => null);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < blobs.length) {
      const index = next++;
      dates[index] = await readDateTakenFrom(blobs[index]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(EXIF_READ_CONCURRENCY, blobs.length) }, worker));
  return dates;
}

/** Reads a `Blob` and hands back the date it was taken, or null. */
export async function readDateTakenFrom(blob: Blob): Promise<DateTaken | null> {
  try {
    const prefix = new Uint8Array(await blob.slice(0, EXIF_PREFIX_BYTES).arrayBuffer());
    const found = locateExif(prefix);
    if (!found) return null;
    if ("at" in found) return readDateTakenAt(prefix, found.at);

    const { offset, length } = found.read;
    const item = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    const at = tiffStartInExifItem(item);
    return at === null ? null : readDateTakenAt(item, at);
  } catch {
    // A file deleted or replaced between listing and reading, or a read the
    // browser refused. Neither is worth failing the whole folder over.
    return null;
  }
}

/**
 * The whole read in one go, for bytes already in hand.
 *
 * Cannot follow an `iloc` offset past the end of what it was given, so it is for
 * complete files — `readDateTakenFrom` is the one to use against a file on disk.
 */
export function readDateTakenIn(bytes: Uint8Array): DateTaken | null {
  const found = locateExif(bytes);
  return found && "at" in found ? readDateTakenAt(bytes, found.at) : null;
}

/** Finds the TIFF header a file's EXIF lives in, whatever container holds it. */
export function locateExif(bytes: Uint8Array): ExifLocation | null {
  try {
    if (bytes.length < 12) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // TIFF: the file is the TIFF block, no container to unwrap.
    if (isTiffHeader(view, 0)) return { at: 0 };
    if (view.getUint16(0) === 0xffd8) return locateInJpeg(view, bytes.length);
    if (view.getUint32(0) === RIFF && view.getUint32(8) === WEBP) {
      return locateInWebp(view, bytes.length);
    }
    if (view.getUint32(4) === BOX_FTYP) return locateInIsoBmff(view, bytes.length);
    return null;
  } catch {
    return null;
  }
}

/** Reads the date out of a TIFF block starting at `at`. */
export function readDateTakenAt(bytes: Uint8Array, at: number): DateTaken | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!isTiffHeader(view, at)) return null;

    const little = view.getUint16(at) === INTEL;
    const tags = new Map<number, string>();
    readIfd(view, at, view.getUint32(at + 4, little), little, tags, 0);

    const wall =
      tags.get(TAG_DATE_TIME_ORIGINAL) ?? tags.get(TAG_CREATE_DATE) ?? tags.get(TAG_MODIFY_DATE);
    return toDateTaken(wall, tags.get(TAG_OFFSET_TIME_ORIGINAL));
  } catch {
    return null;
  }
}

function isTiffHeader(view: DataView, at: number): boolean {
  if (at < 0 || at + 8 > view.byteLength) return false;
  const order = view.getUint16(at);
  if (order !== INTEL && order !== MOTOROLA) return false;
  return view.getUint16(at + 2, order === INTEL) === 42;
}

// ------------------------------------------------------------------ containers

function locateInJpeg(view: DataView, length: number): ExifLocation | null {
  let at = 2;
  while (at + 4 <= length) {
    if (view.getUint8(at) !== 0xff) return null;
    const marker = view.getUint8(at + 1);

    // Standalone markers carry no length field to skip over.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // Start of scan: everything past here is compressed pixels, not metadata.
    if (marker === 0xda || marker === 0xd9) return null;

    const size = view.getUint16(at + 2);
    if (size < 2) return null;
    if (marker === 0xe1 && at + 10 <= length && view.getUint32(at + 4) === FOURCC_EXIF) {
      return { at: at + 10 }; // past "Exif\0\0"
    }
    at += 2 + size;
  }
  return null;
}

function locateInWebp(view: DataView, length: number): ExifLocation | null {
  let at = 12;
  while (at + 8 <= length) {
    const id = view.getUint32(at);
    const size = view.getUint32(at + 4, true); // RIFF is little-endian
    if (id === CHUNK_EXIF) {
      const start = at + 8;
      // Some encoders lead with the JPEG-style "Exif\0\0", others do not.
      const leadIn = start + 6 <= length && view.getUint32(start) === FOURCC_EXIF;
      return { at: leadIn ? start + 6 : start };
    }
    at += 8 + size + (size & 1); // chunks are padded to an even length
  }
  return null;
}

/**
 * HEIC, HEIF and AVIF: EXIF is an item in its own right, described by `iinf` and
 * placed by `iloc`. The offset `iloc` gives is absolute and may point anywhere in
 * the file, which is why this can come back asking for a second read.
 */
function locateInIsoBmff(view: DataView, length: number): ExifLocation | null {
  const meta = findBox(view, 0, length, BOX_META);
  if (!meta) return null;

  // `meta` is a FullBox: four bytes of version and flags before its children.
  const children = { start: meta.start + 4, end: meta.end };
  const iinf = findBox(view, children.start, children.end, BOX_IINF);
  const iloc = findBox(view, children.start, children.end, BOX_ILOC);
  if (!iinf || !iloc) return null;

  const itemId = findExifItemId(view, iinf.start, iinf.end);
  if (itemId === null) return null;

  const extent = findItemExtent(view, iloc.start, iloc.end, itemId);
  if (!extent) return null;

  if (extent.offset + extent.length > length) return { read: extent };

  const at = tiffStartInExifItem(
    new Uint8Array(view.buffer, view.byteOffset + extent.offset, extent.length),
  );
  return at === null ? null : { at: extent.offset + at };
}

interface Box {
  start: number;
  end: number;
}

/** First box of type `want` between `from` and `to`, or null. */
function findBox(view: DataView, from: number, to: number, want: number): Box | null {
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      // A 64-bit size. We never look past a few MB, so the high word is zero.
      if (at + 16 > to) return null;
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    }
    if (size === 0) size = to - at; // runs to the end of its parent
    if (size < header) return null;
    if (view.getUint32(at + 4) === want) {
      return { start: at + header, end: Math.min(at + size, to) };
    }
    at += size;
  }
  return null;
}

function findExifItemId(view: DataView, start: number, end: number): number | null {
  const version = view.getUint8(start);
  const count = version === 0 ? view.getUint16(start + 4) : view.getUint32(start + 4);
  let at = start + (version === 0 ? 6 : 8);

  for (let i = 0; i < count && at + 12 <= end; i++) {
    const size = view.getUint32(at);
    if (size < 12) return null;
    const infeVersion = view.getUint8(at + 8);
    // Only version 2 and up name the item's type; version 0 and 1 are for a
    // flavour of HEIF nothing writes any more.
    if (infeVersion >= 2) {
      const idBytes = infeVersion === 2 ? 2 : 4;
      const typeAt = at + 12 + idBytes + 2; // + protection_index
      if (typeAt + 4 <= end && view.getUint32(typeAt) === FOURCC_EXIF) {
        return infeVersion === 2 ? view.getUint16(at + 12) : view.getUint32(at + 12);
      }
    }
    at += size;
  }
  return null;
}

function findItemExtent(
  view: DataView,
  start: number,
  end: number,
  itemId: number,
): { offset: number; length: number } | null {
  const version = view.getUint8(start);
  const sizes = view.getUint8(start + 4);
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 0xf;
  const baseSize = view.getUint8(start + 5) >> 4;
  const indexSize = version >= 1 ? view.getUint8(start + 5) & 0xf : 0;

  let at = start + 6;
  const count = version < 2 ? view.getUint16(at) : view.getUint32(at);
  at += version < 2 ? 2 : 4;

  const readSized = (from: number, size: number): number | null => {
    if (from + size > end) return null;
    if (size === 0) return 0;
    if (size === 4) return view.getUint32(from);
    if (size === 8) return Number(view.getBigUint64(from));
    if (size === 2) return view.getUint16(from);
    return null;
  };

  for (let i = 0; i < count && at < end; i++) {
    const id = version < 2 ? view.getUint16(at) : view.getUint32(at);
    at += version < 2 ? 2 : 4;
    if (version >= 1) at += 2; // construction_method
    at += 2; // data_reference_index

    const base = readSized(at, baseSize);
    if (base === null) return null;
    at += baseSize;

    if (at + 2 > end) return null;
    const extents = view.getUint16(at);
    at += 2;

    for (let k = 0; k < extents; k++) {
      at += indexSize;
      const offset = readSized(at, offsetSize);
      at += offsetSize;
      const length = readSized(at, lengthSize);
      at += lengthSize;
      if (offset === null || length === null) return null;
      // The first extent is the whole EXIF block in every file that writes one;
      // a split payload would need reassembling, which nothing produces.
      if (id === itemId) return { offset: base + offset, length };
    }
  }
  return null;
}

/**
 * An EXIF item's payload leads with a four-byte count of the bytes sitting
 * before the TIFF header — in practice the same "Exif\0\0" a JPEG uses.
 */
function tiffStartInExifItem(item: Uint8Array): number | null {
  if (item.length < 8) return null;
  const view = new DataView(item.buffer, item.byteOffset, item.byteLength);
  const at = 4 + view.getUint32(0);
  return isTiffHeader(view, at) ? at : null;
}

// ------------------------------------------------------------------------ TIFF

/**
 * Collects the ASCII tags we care about from one IFD, following the pointer into
 * the Exif IFD where the interesting dates actually live.
 */
function readIfd(
  view: DataView,
  base: number,
  offset: number,
  little: boolean,
  into: Map<number, string>,
  depth: number,
): void {
  // IFD0 -> Exif IFD is the only hop worth making; anything deeper is a loop.
  if (depth > 1) return;
  const start = base + offset;
  if (start < base || start + 2 > view.byteLength) return;

  const count = view.getUint16(start, little);
  for (let i = 0; i < count; i++) {
    const entry = start + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);

    if (tag === TAG_EXIF_IFD && type === TYPE_LONG) {
      readIfd(view, base, view.getUint32(entry + 8, little), little, into, depth + 1);
      continue;
    }
    if (type !== TYPE_ASCII || length === 0 || length > 64) continue;
    if (
      tag !== TAG_DATE_TIME_ORIGINAL &&
      tag !== TAG_CREATE_DATE &&
      tag !== TAG_MODIFY_DATE &&
      tag !== TAG_OFFSET_TIME_ORIGINAL
    ) {
      continue;
    }

    // Values of four bytes or fewer sit in the entry; longer ones are stored at
    // an offset from the TIFF header and referenced from it.
    const valueAt = length <= 4 ? entry + 8 : base + view.getUint32(entry + 8, little);
    if (valueAt < 0 || valueAt + length > view.byteLength) continue;

    let value = "";
    for (let k = 0; k < length; k++) {
      const code = view.getUint8(valueAt + k);
      if (code === 0) break; // NUL-terminated, and the count includes the NUL
      value += String.fromCharCode(code);
    }
    into.set(tag, value.trim());
  }
}

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const EXIF_OFFSET = /^([+-])(\d{2}):(\d{2})$/;

function toDateTaken(wall: string | undefined, offset: string | undefined): DateTaken | null {
  const parts = EXIF_DATE.exec(wall ?? "");
  if (!parts) return null;

  const [, year, month, day, hour, minute, second] = parts;
  // A camera with a flat backup battery writes 0000:00:00, and the placeholder
  // dates phones stamp on undatable files sort worse than no date at all.
  if (Number(year) < 1900) return null;

  const wallClock = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const offsetMinutes = parseOffset(offset);

  // Without an offset the only honest reading is local time: a camera writes the
  // clock it was set to, and calling that UTC shifts every photo by however far
  // from Greenwich the person looking at it happens to be.
  const epoch = Date.parse(offsetMinutes === null ? wallClock : `${wallClock}${offset}`);
  return Number.isNaN(epoch) ? null : { epoch, wallClock, offsetMinutes };
}

function parseOffset(offset: string | undefined): number | null {
  const parts = EXIF_OFFSET.exec(offset ?? "");
  if (!parts) return null;
  const [, sign, hours, minutes] = parts;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -total : total;
}
