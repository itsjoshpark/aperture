/** Extensions Aperture will show in the gallery. Compared case-insensitively. */
export const IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
] as const;

const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

/**
 * Extensions Aperture will list but cannot show.
 *
 * Chrome has no TIFF decoder for `<img>` and there is no small library worth
 * shipping for it. TIFFs stay in the gallery — culling and renaming them is most
 * of the point — but the tile says up front that there is no preview instead of
 * showing an empty frame and leaving you to wonder.
 */
const UNDECODABLE_EXTENSIONS = new Set([".tif", ".tiff"]);

/**
 * Extensions Chrome will not draw but Aperture decodes itself.
 *
 * Chrome ships no HEIC decoder and is not going to — HEVC is covered by patent
 * pools it does not license — and an iPhone camera roll is mostly HEIC, so
 * giving up on it would blind the app to its own main use case. These go through
 * libheif in a worker instead. See `lib/preview/`.
 */
const DECODED_EXTENSIONS = new Set([".heic", ".heif"]);

/** True when Aperture can put this file on screen, one way or another. */
export function isPreviewable(name: string): boolean {
  return !UNDECODABLE_EXTENSIONS.has(splitName(name).ext.toLowerCase());
}

/**
 * True when showing this file means decoding it ourselves first — slow enough
 * (hundreds of milliseconds) that callers should expect to wait.
 */
export function needsDecoding(name: string): boolean {
  return DECODED_EXTENSIONS.has(splitName(name).ext.toLowerCase());
}

/**
 * Split a filename into its base and extension.
 *
 * The extension is the final dot onwards, so `archive.tar.gz` splits to
 * `archive.tar` + `.gz`. A leading dot is part of the name, not an extension —
 * `.hidden` has no extension at all — which matters because our temp files are
 * dotfiles.
 */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSION_SET.has(splitName(name).ext.toLowerCase());
}
