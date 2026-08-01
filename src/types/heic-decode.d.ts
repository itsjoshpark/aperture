/**
 * `heic-decode` ships no types of its own, and there is no `@types` package.
 * Only the default export is declared, because only the default export is used.
 */
declare module "heic-decode" {
  export interface DecodedImage {
    width: number;
    height: number;
    /**
     * Interleaved RGBA, `width * height * 4` bytes. Pinned to `ArrayBuffer`
     * rather than `ArrayBufferLike` so it can be handed straight to `ImageData`,
     * which will not take a possibly-shared buffer.
     */
    data: Uint8ClampedArray<ArrayBuffer>;
  }

  function decode(input: { buffer: Uint8Array }): Promise<DecodedImage>;

  export default decode;
}
