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
