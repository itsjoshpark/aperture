import { render } from "vitest-browser-vue";
import { expect, test } from "vite-plus/test";
import ImageTile from "./ImageTile.vue";
import type { ImageEntry } from "@/lib/fs/types";
import { ThumbnailCache } from "@/lib/thumbnails";

/**
 * The tile is the one place in the app where an actual photo has to appear on
 * screen, and the path there crosses three boundaries: an IntersectionObserver
 * decides when to read, the cache turns a File into an object URL, and the
 * `<img>` has to end up visible. A DOM shim can't observe any of that.
 */

/** A real 64x64 PNG — a 1x1 pixel would render as one pixel and prove nothing. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfHEPZPYRhD+HEIgwW4zVn764YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQwg8HFgABc6zLrQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

function entryFor(name = "photo.png"): ImageEntry {
  return {
    name,
    base: name.replace(/\.[^.]+$/, ""),
    ext: ".png",
    size: PNG.byteLength,
    lastModified: 1_700_000_000_000,
    getFile: async () => new File([PNG as unknown as BlobPart], name, { type: "image/png" }),
  };
}

function mount(entry = entryFor(), cache = new ThumbnailCache()) {
  return render(ImageTile, { props: { entry, cache, selected: false } });
}

test("shows the image", async () => {
  const screen = mount();

  const image = screen.getByRole("img");
  await expect.element(image).toBeVisible();

  // Decoded, not merely present with a src that failed to load.
  await expect.poll(() => (image.element() as HTMLImageElement).naturalWidth).toBe(64);
});

test("makes the image fully opaque once it has loaded", async () => {
  const screen = mount();
  const image = screen.getByRole("img");
  await expect.element(image).toBeVisible();

  await expect.poll(() => getComputedStyle(image.element()).opacity).toBe("1");
});

test("shows the file name and a delete control", async () => {
  const screen = mount(entryFor("beach.png"));

  await expect.element(screen.getByText("beach.png")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Delete beach\.png/ })).toBeVisible();
});

test("says so when the browser cannot decode the file", async () => {
  // Chrome renders no HEIC and no TIFF, which is most of an iPhone camera roll.
  // Without this the tile is a blank white frame forever, with nothing to
  // explain why — indistinguishable from the app being broken.
  const entry: ImageEntry = {
    name: "IMG_0042.heic",
    base: "IMG_0042",
    ext: ".heic",
    size: 8,
    lastModified: 1_700_000_000_000,
    getFile: async () =>
      new File(
        [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]) as unknown as BlobPart],
        "IMG_0042.heic",
        {
          type: "image/heic",
        },
      ),
  };

  const screen = render(ImageTile, {
    props: { entry, cache: new ThumbnailCache(), selected: false },
  });

  await expect.element(screen.getByText(/no preview/i)).toBeVisible();
  await expect.element(screen.getByText("IMG_0042.heic")).toBeVisible();
});

test("says so when an image fails to load", async () => {
  const entry: ImageEntry = {
    name: "corrupt.jpg",
    base: "corrupt",
    ext: ".jpg",
    size: 4,
    lastModified: 1_700_000_000_000,
    getFile: async () =>
      new File([Uint8Array.from([9, 9, 9, 9]) as unknown as BlobPart], "corrupt.jpg", {
        type: "image/jpeg",
      }),
  };

  const screen = render(ImageTile, {
    props: { entry, cache: new ThumbnailCache(), selected: false },
  });

  await expect.element(screen.getByText(/no preview/i)).toBeVisible();
});

test("swaps to the new file when the entry is renamed", async () => {
  const cache = new ThumbnailCache();
  const screen = mount(entryFor("before.png"), cache);
  await expect.element(screen.getByRole("img")).toBeVisible();

  await screen.rerender({ entry: entryFor("after.png"), cache, selected: false });

  await expect.element(screen.getByText("after.png")).toBeVisible();
  await expect
    .poll(() => (screen.getByRole("img").element() as HTMLImageElement).naturalWidth)
    .toBe(64);
});
