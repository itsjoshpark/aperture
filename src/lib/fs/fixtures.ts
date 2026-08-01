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

/** `File` for one of the above, ready for an `ImageEntry.getFile()`. */
export function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}
