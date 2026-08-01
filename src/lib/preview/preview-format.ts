/**
 * Shape of a decoded preview. Shared by the worker and its tests.
 *
 * One size serves every surface. Decoding is expensive enough (~600 ms for a
 * 12 MP photo) that doing it twice — once small for the grid, once large for the
 * large view — would be felt, so the grid gets a bigger image than it needs
 * rather than the large view getting a soft one.
 *
 * 2048 on the longest edge is sharp on any laptop display and lands at roughly
 * 250 KB per photo, which is what `ThumbnailCache`'s byte budget is sized
 * against.
 */

export const MAX_PREVIEW_EDGE = 2048;
export const PREVIEW_TYPE = "image/jpeg";
export const PREVIEW_QUALITY = 0.85;

/**
 * Fit within `MAX_PREVIEW_EDGE`, preserving aspect ratio and never upscaling.
 *
 * Split out from the worker so it can be tested in node: the fixtures small
 * enough to check into a repo are all smaller than the cap, so a test using one
 * would never reach the branch that matters.
 */
export function previewSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
