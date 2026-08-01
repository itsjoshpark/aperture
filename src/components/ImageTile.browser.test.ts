import { render } from "vitest-browser-vue";
import { expect, test } from "vite-plus/test";
import ImageTile from "./ImageTile.vue";
import { fileOf, HEIC_64, PNG_64 } from "@/lib/fs/fixtures";
import type { ImageEntry } from "@/lib/fs/types";
import { createPreviewSource } from "@/lib/preview/renderer";
import { ThumbnailCache } from "@/lib/thumbnails";

/**
 * The tile is the one place in the app where an actual photo has to appear on
 * screen, and the path there crosses three boundaries: an IntersectionObserver
 * decides when to read, the cache turns a File into an object URL, and the
 * `<img>` has to end up visible. A DOM shim can't observe any of that.
 */

function entryFor(name = "photo.png"): ImageEntry {
  return {
    name,
    base: name.replace(/\.[^.]+$/, ""),
    ext: ".png",
    size: PNG_64.byteLength,
    lastModified: 1_700_000_000_000,
    getFile: async () => fileOf(PNG_64, name, "image/png"),
  };
}

/** An entry over arbitrary bytes, for the formats and files that go wrong. */
function entryOver(name: string, bytes: Uint8Array, type: string): ImageEntry {
  const ext = name.slice(name.lastIndexOf("."));
  return {
    name,
    base: name.slice(0, name.lastIndexOf(".")),
    ext,
    size: bytes.byteLength,
    lastModified: 1_700_000_000_000,
    getFile: async () => fileOf(bytes, name, type),
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

test("says so when nothing can decode the format", async () => {
  // Chrome renders no TIFF and there is no decoder worth shipping for it.
  // Without this the tile is a blank white frame forever, with nothing to
  // explain why — indistinguishable from the app being broken.
  const entry = entryOver("scan.tiff", Uint8Array.from([0, 1, 2, 3]), "image/tiff");

  const screen = render(ImageTile, {
    props: { entry, cache: new ThumbnailCache(), selected: false },
  });

  await expect.element(screen.getByText(/no preview/i)).toBeVisible();
  await expect.element(screen.getByText(/TIFF can't be previewed/i)).toBeVisible();
  await expect.element(screen.getByText("scan.tiff")).toBeVisible();
});

/**
 * Chrome cannot draw HEIC, so the tile only shows one if the whole libheif
 * worker path worked — the format an iPhone camera roll is actually made of.
 */
test("decodes a HEIC and shows it", async () => {
  const previews = createPreviewSource();
  try {
    const screen = render(ImageTile, {
      props: {
        entry: entryOver("IMG_0042.heic", HEIC_64, "image/heic"),
        cache: new ThumbnailCache({ render: previews.render }),
        selected: false,
      },
    });

    const image = screen.getByRole("img");
    await expect.element(image).toBeVisible();
    await expect.poll(() => (image.element() as HTMLImageElement).naturalWidth).toBe(64);
  } finally {
    previews.dispose();
  }
});

test("says so when a HEIC will not decode", async () => {
  const previews = createPreviewSource();
  try {
    const screen = render(ImageTile, {
      props: {
        entry: entryOver("broken.heic", Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), "image/heic"),
        cache: new ThumbnailCache({ render: previews.render }),
        selected: false,
      },
    });

    await expect.element(screen.getByText(/no preview/i)).toBeVisible();
    await expect.element(screen.getByText("broken.heic")).toBeVisible();
  } finally {
    previews.dispose();
  }
});

test("says so when an image fails to load", async () => {
  const entry = entryOver("corrupt.jpg", Uint8Array.from([9, 9, 9, 9]), "image/jpeg");

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
