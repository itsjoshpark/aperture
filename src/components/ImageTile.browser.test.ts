import { render } from "vitest-browser-vue";
import { expect, test } from "vite-plus/test";
// The tile's entire layout is Tailwind utilities, so the drag test below is
// only measuring anything real with the app's stylesheet actually loaded.
import "@/assets/index.css";
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
    dateTaken: null,
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
    dateTaken: null,
    getFile: async () => fileOf(bytes, name, type),
  };
}

/** Real PNG bytes of a given shape — every fixture on disk is square. */
async function pngOf(width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#c0392b";
  context.fillRect(0, 0, width, height);

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((result) => resolve(result!), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function mount(
  entry = entryFor(),
  cache = new ThumbnailCache(),
  props: Record<string, unknown> = {},
) {
  return render(ImageTile, { props: { entry, cache, selected: false, ...props } });
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

/**
 * The drag is only legible if the tile is in two places at once: the card under
 * the cursor, and an outline of the cell it would land in. Both come out of one
 * element staying put while a child is offset, which is a claim about real
 * layout — a computed `transform` string alone would not catch the day someone
 * puts the transform back on the cell.
 */
test("leaves a placeholder in the cell and offsets the card", async () => {
  const translate = { x: 60, y: 40 };
  const props = {
    entry: entryFor(),
    cache: new ThumbnailCache(),
    selected: false,
    dragging: false,
    translate: { x: 0, y: 0 },
  };
  const screen = render(ImageTile, { props });

  const cell = screen.getByRole("gridcell").element();
  const card = cell.firstElementChild as HTMLElement;
  const atRest = cell.getBoundingClientRect();

  await screen.rerender({ ...props, dragging: true, translate });

  const placeholder = cell.querySelector("[data-drop-placeholder]");
  expect(placeholder).not.toBeNull();

  // The cell has not moved: the placeholder marks where the tile still belongs.
  const cellNow = cell.getBoundingClientRect();
  expect(cellNow.left).toBeCloseTo(atRest.left, 0);
  expect(cellNow.top).toBeCloseTo(atRest.top, 0);

  // And it stops above the caption rather than boxing the whole cell in.
  expect(placeholder!.getBoundingClientRect().bottom).toBeLessThan(
    screen.getByText("photo.png").element().getBoundingClientRect().top,
  );

  // The card has.
  const lifted = card.getBoundingClientRect();
  expect(lifted.left - cellNow.left).toBeCloseTo(translate.x, 0);
  expect(lifted.top - cellNow.top).toBeCloseTo(translate.y, 0);
});

/**
 * The dashed outline and the selection band are the same claim drawn twice —
 * this is where the photo will be, this is the photo you have — so they have to
 * land on the same pixels. A wide photo is what makes that a real test: boxing
 * the cell instead of the picture is invisible on a square one.
 */
test("puts the drop placeholder exactly where the selection border will be", async () => {
  const { cell, cellRect, border } = await selectedTile("wide.png", await pngOf(400, 120), {
    dragging: true,
    translate: { x: 0, y: 0 },
  });

  const placeholder = cell.querySelector("[data-drop-placeholder]")!;
  expect(getComputedStyle(placeholder).borderTopWidth).toBe("3px");

  const ghost = placeholder.getBoundingClientRect();
  for (const edge of ["left", "top", "right", "bottom"] as const) {
    expect(ghost[edge]).toBeCloseTo(border[edge], 0);
  }

  // Which is to say: round the photograph, not round the square it sits in.
  expect(ghost.height).toBeLessThan(cellRect.width);
});

/**
 * A lifted tile has to read as picked up without reading as a card: photographs
 * are every shape and the card is always a square, so a surface drawn on the
 * card shows a dark rectangle around a photo that does not fill it. The shadow
 * belongs to the picture instead.
 */
test("lifts the photograph, not a square card behind it", async () => {
  const { cell, cellRect, photoBox } = await selectedTile("wide.png", await pngOf(400, 120), {
    dragging: true,
    translate: { x: 0, y: 0 },
  });
  const card = cell.querySelector("[data-tile-card]")!;

  // Nothing paints the card's own rectangle.
  expect(getComputedStyle(card).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(card).boxShadow).toBe("none");

  // The lift is cast by the photo's box, which is the photo's shape.
  expect(getComputedStyle(photoBox).boxShadow).not.toBe("none");
  expect(photoBox.getBoundingClientRect().height).toBeLessThan(cellRect.width - 10);
});

/**
 * Text decoration does not cross into an atomic inline box, so backing the
 * caption while it is carried is exactly the change that can silently un-strike
 * the old name — the one line of a rename preview that says it is the old one.
 */
test("keeps the old name struck through while the tile is carried", async () => {
  const screen = mount(entryFor("beach.png"), new ThumbnailCache(), {
    previewName: "1.png",
    dragging: true,
  });

  const old = screen.getByText("beach.png").element();
  expect(getComputedStyle(old).textDecorationLine).toBe("line-through");
});

test("has no placeholder when it is not being dragged", async () => {
  const screen = mount();
  await expect.element(screen.getByRole("img")).toBeVisible();

  expect(
    screen.getByRole("gridcell").element().querySelector("[data-drop-placeholder]"),
  ).toBeNull();
});

/**
 * Renders one selected tile 160px wide — narrower than the photographs below are
 * intrinsically, so a box sized off the image rather than off the square shows
 * up as a tile of the wrong size. Resolves once the photo has taken its shape.
 */
async function selectedTile(name: string, bytes: Uint8Array, props: Record<string, unknown> = {}) {
  const screen = render(ImageTile, {
    props: {
      entry: entryOver(name, bytes, "image/png"),
      cache: new ThumbnailCache(),
      selected: true,
      ...props,
    },
  });
  screen.container.style.width = "160px";

  // Every shape passed in below is oblong, so a square box is one that has yet
  // to decode — which is the only reliable signal that the photo has reported
  // its ratio and the boxes drawn from it are the real ones.
  const image = screen.getByRole("img", { name });
  const box = () => image.element().getBoundingClientRect();
  await expect.element(image).toBeVisible();
  await expect.poll(() => box().width !== box().height).toBe(true);

  const cell = image.element().closest('[role="gridcell"]')! as HTMLElement;
  return {
    screen,
    cell,
    photoBox: image.element().parentElement!,
    photo: box(),
    cellRect: cell.getBoundingClientRect(),
    border: cell.querySelector("[data-selection]")!.getBoundingClientRect(),
  };
}

/**
 * What is selected is the photograph, not the record: the border boxes in the
 * photo, stops above the caption, and traces the shape of the image rather than
 * the square it is laid out in — which the letterboxing makes different.
 */
test("draws the selection border around the photo and not the caption", async () => {
  const screen = render(ImageTile, {
    props: { entry: entryFor("beach.png"), cache: new ThumbnailCache(), selected: true },
  });
  await expect.element(screen.getByRole("img")).toBeVisible();

  const cell = screen.getByRole("gridcell").element();
  const border = cell.querySelector("[data-selection]")!.getBoundingClientRect();
  const caption = screen.getByText("beach.png").element().getBoundingClientRect();
  expect(border.bottom).toBeLessThan(caption.top);

  const { photo, border: wide } = await selectedTile("wide.png", await pngOf(400, 120));

  // Five pixels clear of the photo on every side: a 2px gap, then the 3px band.
  expect(wide.left).toBeCloseTo(photo.left - 5, 0);
  expect(wide.top).toBeCloseTo(photo.top - 5, 0);
  expect(wide.right).toBeCloseTo(photo.right + 5, 0);
  expect(wide.bottom).toBeCloseTo(photo.bottom + 5, 0);
});

/**
 * The click target is the photograph, not the square it sits in. Everything else
 * inside the cell is layout — and the grid reads a click that reaches it as a
 * click on the background, which clears the selection. Getting this wrong is
 * invisible until the letterboxing beside a wide photo stops deselecting.
 */
test("takes a selecting click on the photo and the caption, and nowhere else", async () => {
  const screen = render(ImageTile, {
    props: {
      entry: entryOver("wide.png", await pngOf(400, 120), "image/png"),
      cache: new ThumbnailCache(),
      selected: false,
    },
  });
  screen.container.style.width = "160px";

  const image = screen.getByRole("img", { name: "wide.png" });
  await expect.element(image).toBeVisible();
  const photo = () => image.element().getBoundingClientRect();
  await expect.poll(() => photo().width !== photo().height).toBe(true);

  const cell = screen.getByRole("gridcell").element();
  const square = cell.querySelector(".aspect-square")!.getBoundingClientRect();
  const box = photo();

  // The gutter above a wide photo belongs to no picture. A click there has to
  // pass through to the grid, so it must not sit inside a select target.
  const gutter = document.elementFromPoint(box.left + box.width / 2, square.top + 2)!;
  expect(gutter.closest("[data-select-target]")).toBeNull();

  const onPhoto = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)!;
  expect(onPhoto.closest("[data-select-target]")).not.toBeNull();

  const caption = screen.getByText("wide.png").element().getBoundingClientRect();
  const onCaption = document.elementFromPoint(caption.left + 2, caption.top + caption.height / 2)!;
  expect(onCaption.closest("[data-select-target]")).not.toBeNull();
});

/**
 * The square each photo is laid out in is invisible and load-bearing: it is what
 * lines a row of tiles up, and a photograph is almost never square. Sizing the
 * photo's box off the image is exactly how a tile comes to be the size of its
 * own photo instead.
 */
test("stays the size of its square whatever shape the photo is", async () => {
  const tall = await selectedTile("tall.png", await pngOf(200, 300));
  const wide = await selectedTile("wide.png", await pngOf(400, 120));

  expect(tall.cellRect.height).toBeCloseTo(wide.cellRect.height, 0);

  // Neither photo is bigger than the square it is laid out in.
  for (const { photo, cellRect } of [tall, wide]) {
    expect(photo.width).toBeLessThanOrEqual(cellRect.width + 1);
    expect(photo.height).toBeLessThanOrEqual(cellRect.width + 1);
  }
});

test("shows the file name and no controls of its own", async () => {
  const screen = mount(entryFor("beach.png"));

  await expect.element(screen.getByText("beach.png")).toBeVisible();
  // Nothing is drawn beside a photograph. Delete lives in the toolbar.
  expect(screen.getByRole("gridcell").element().querySelector("button")).toBeNull();
});

test("says so when nothing can decode the format", async () => {
  // Chrome renders no TIFF and there is no decoder worth shipping for it.
  // Without this the tile is an empty square forever, with nothing to explain
  // why — indistinguishable from the app being broken.
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

/**
 * Renumbering a folder that is already numbered is a permutation: every name in
 * it survives the rename pointing at a different photo. So the name is no
 * evidence that the file behind it is the same file, and a tile that compares
 * names goes on drawing the photo it had — the whole grid redraws itself as it
 * was, while the disk is correct.
 */
test("swaps to the new file when a rename hands the same name to another photo", async () => {
  const cache = new ThumbnailCache();
  const screen = mount(entryOver("1.png", await pngOf(64, 64), "image/png"), cache);
  const image = screen.getByRole("img");
  await expect.poll(() => (image.element() as HTMLImageElement).naturalHeight).toBe(64);

  // What an applied rename does, in order: the cache is dropped because names
  // are its keys, then the tile is handed a different file under the name it is
  // already showing.
  cache.clear();
  await screen.rerender({
    entry: entryOver("1.png", await pngOf(64, 32), "image/png"),
    cache,
    selected: false,
  });

  await expect
    .poll(() => (screen.getByRole("img").element() as HTMLImageElement).naturalHeight)
    .toBe(32);
});
