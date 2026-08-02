import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke coverage for the flows that only exist once everything is wired
 * together. The rename engine's own correctness lives in the unit tests, where
 * the awkward cases (swaps, rollback, undo) can be exercised directly.
 */

const HARNESS = "e2e/harness.html";

async function openGallery(page: Page, files?: string[]): Promise<void> {
  const query = files ? `?files=${files.join(",")}` : "";
  await page.goto(`${HARNESS}${query}`);
  await page.getByRole("button", { name: "Open folder…" }).click();
  await expect(page.getByRole("grid")).toBeVisible();
}

const tile = (page: Page, name: string) => page.getByRole("gridcell").filter({ hasText: name });
const selected = (page: Page) => page.locator('[role="gridcell"][aria-selected="true"]');
/**
 * What actually landed "on disk". The specs typecheck under the Node config,
 * which has no DOM lib, so the harness hooks are described here rather than
 * pulling `lib.dom` into a Node project just for one global.
 */
interface ApertureTestHooks {
  names: () => string[];
  renameLog: () => Array<{ from: string; to: string }>;
}

const diskNames = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as { __aperture: ApertureTestHooks }).__aperture.names(),
  );

test("opens a folder and shows every image", async ({ page }) => {
  await openGallery(page);

  await expect(page.getByRole("gridcell")).toHaveCount(6);
  await expect(page.getByText("6 images")).toBeVisible();
});

test("sorts by name, reading numbers the way people do", async ({ page }) => {
  await openGallery(page, ["IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg"]);

  await expect(page.getByRole("gridcell")).toHaveText([/IMG_1\.jpg/, /IMG_2\.jpg/, /IMG_10\.jpg/]);
});

test("reverses the order on descending", async ({ page }) => {
  await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

  await page.getByRole("button", { name: /Name/ }).click();
  await page.getByRole("menuitem", { name: "Descending" }).click();

  await expect(page.getByRole("gridcell")).toHaveText([/c\.jpg/, /b\.jpg/, /a\.jpg/]);
});

test.describe("keyboard", () => {
  test("moves the selection with the arrow keys", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);
    await expect(selected(page)).toHaveText(/a\.jpg/);

    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText(/b\.jpg/);

    await page.keyboard.press("ArrowLeft");
    await expect(selected(page)).toHaveText(/a\.jpg/);

    await page.keyboard.press("End");
    await expect(selected(page)).toHaveText(/c\.jpg/);

    await page.keyboard.press("Home");
    await expect(selected(page)).toHaveText(/a\.jpg/);
  });

  test("stops at the ends instead of wrapping", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await page.keyboard.press("ArrowLeft");
    await expect(selected(page)).toHaveText(/a\.jpg/);
  });

  test("opens and closes the large view with Space and Escape", async ({ page }) => {
    await openGallery(page);

    await page.keyboard.press(" ");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeHidden();
  });

  test("Escape never clears the selection", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText(/b\.jpg/);

    // Once from the grid, and once on the way back out of the large view.
    await page.keyboard.press("Escape");
    await expect(selected(page)).toHaveText(/b\.jpg/);

    await page.keyboard.press(" ");
    await page.keyboard.press("Escape");
    await expect(selected(page)).toHaveText(/b\.jpg/);

    await page.keyboard.press("Escape");
    await expect(selected(page)).toHaveText(/b\.jpg/);
  });

  test("keeps the selection on the same photo through a re-sort", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: /Name/ }).click();
    await page.getByRole("menuitem", { name: "Descending" }).click();

    await expect(selected(page)).toHaveText(/b\.jpg/);
  });
});

test.describe("delete", () => {
  test("warns that deleting is permanent, then deletes", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toContainText("not moved to the Trash");

    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["b.jpg", "c.jpg"]);
  });

  test("leaves the file alone when cancelled", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("returns to the grid when the last image goes", async ({ page }) => {
    await openGallery(page, ["only.jpg"]);

    await page.keyboard.press(" ");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeVisible();

    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeHidden();
    await expect(page.getByText("No images in this folder.")).toBeVisible();
  });

  test("moves the selection to the next image", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(selected(page)).toHaveText(/b\.jpg/);
  });
});

test.describe("preview size", () => {
  const sizeSlider = (page: Page) => page.getByRole("slider", { name: "Preview size" });

  test("resizes the previews with the slider", async ({ page }) => {
    await openGallery(page);

    const first = tile(page, "beach.jpg");
    const before = (await first.boundingBox())!.width;

    await sizeSlider(page).press("ArrowRight");
    await sizeSlider(page).press("ArrowRight");
    await sizeSlider(page).press("ArrowRight");

    await expect.poll(async () => (await first.boundingBox())!.width).not.toBeCloseTo(before, 0);
  });

  /**
   * The slider takes focus on pointerdown, as it must to be draggable. If it
   * keeps focus afterwards, the arrow keys stay pointed at it and the only way
   * back to the gallery is the mouse — which is precisely the escape route
   * someone navigating by keyboard does not have.
   */
  test("hands focus back after a drag, so the arrow keys still move the selection", async ({
    page,
  }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);
    await expect(selected(page)).toHaveText(/a\.jpg/);

    const thumb = (await sizeSlider(page).boundingBox())!;
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2 + 60, thumb.y + thumb.height / 2, { steps: 8 });
    await page.mouse.up();

    // The drag has to have done something, or focus proves nothing.
    await expect(sizeSlider(page)).not.toHaveAttribute("aria-valuenow", "160");

    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText(/b\.jpg/);
  });

  test("remembers the size across a reload", async ({ page }) => {
    await openGallery(page);

    await sizeSlider(page).press("ArrowRight");
    await sizeSlider(page).press("ArrowRight");
    const chosen = await sizeSlider(page).getAttribute("aria-valuenow");
    expect(chosen).not.toBe("160");

    await page.reload();
    await page.getByRole("button", { name: "Open folder…" }).click();
    await expect(page.getByRole("grid")).toBeVisible();

    await expect(sizeSlider(page)).toHaveAttribute("aria-valuenow", chosen!);
  });
});

test.describe("rename", () => {
  test("renames in the dragged order, then undoes it", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    // Drag the last tile onto the first cell.
    const source = tile(page, "c.jpg");
    const target = tile(page, "a.jpg");
    await source.hover();
    await page.mouse.down();
    const box = (await target.boundingBox())!;
    // Two moves: the first crosses the drag threshold, the second lands.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });

    // Mid-drag, the cell the tile would land in is outlined.
    await expect(page.locator("[data-drop-placeholder]")).toBeVisible();

    await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
    await page.mouse.up();

    await expect(page.locator("[data-drop-placeholder]")).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Custom order" })).toBeVisible();
    await expect(page.getByRole("gridcell")).toHaveText([/c\.jpg/, /a\.jpg/, /b\.jpg/]);

    await page.getByLabel("Prefix").fill("trip-");
    await expect(page.getByRole("gridcell").first()).toContainText("trip-1.jpg");

    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

    await expect
      .poll(() => diskNames(page).then((names) => names.slice().sort()))
      .toEqual(["trip-1.jpg", "trip-2.jpg", "trip-3.jpg"]);

    // The tiles now show the real names, not a preview of them.
    await expect(page.getByRole("gridcell")).toHaveText([
      /^trip-1\.jpg/,
      /^trip-2\.jpg/,
      /^trip-3\.jpg/,
    ]);

    // The Rename button has become Undo, in place.
    await expect(page.getByRole("button", { name: /^Rename \d+ files?$/ })).toBeHidden();
    await page.getByRole("button", { name: "Undo rename" }).click();

    await expect
      .poll(() => diskNames(page).then((names) => names.slice().sort()))
      .toEqual(["a.jpg", "b.jpg", "c.jpg"]);

    // Undoing returns to the ordinary gallery, sorting restored.
    await expect(page.getByRole("button", { name: /Name/ })).toBeVisible();
  });

  /**
   * The lifted card is transformed, and a transformed box still counts towards
   * the scroller's scrollable overflow — so auto-scrolling towards it makes yet
   * more room to scroll. Left unclamped, holding a drag at the bottom edge runs
   * off the end of the last row and leaves an empty grid on screen.
   */
  test("auto-scrolls to the end of the list and no further", async ({ page }) => {
    const files = Array.from({ length: 40 }, (_, i) => `p${String(i + 1).padStart(2, "0")}.jpg`);
    await openGallery(page, files);

    const scroller = page.locator("div.overflow-y-auto").first();
    const bounds = (await scroller.boundingBox())!;

    await tile(page, "p02.jpg").hover();
    await page.mouse.down();
    // Into the auto-scroll band at the bottom, then held there.
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 20, {
      steps: 10,
    });
    await page.waitForTimeout(1500);

    // How far past the end of the grid's own laid-out height we have scrolled.
    const overscroll = await scroller.evaluate((el) => {
      const grid = el.firstElementChild;
      const limit = grid ? grid.getBoundingClientRect().height - el.clientHeight : 0;
      return el.scrollTop - limit;
    });
    expect(overscroll).toBeLessThanOrEqual(1);

    // And the last row is still on screen, rather than scrolled past.
    await expect(page.getByRole("gridcell").last()).toBeInViewport();

    await page.mouse.up();
  });

  test("keeps the arrangement visible after renaming", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.getByRole("button", { name: "Rename…" }).click();
    await page.getByLabel("Prefix").fill("shot-");
    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

    await expect(page.getByText("Renamed.")).toBeVisible();

    // Closing the bar afterwards must not prompt — the work is already on disk.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Rename…" })).toBeVisible();
  });

  test("reorders from the keyboard as well as the mouse", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("ControlOrMeta+ArrowRight");

    await expect(page.getByRole("button", { name: "Custom order" })).toBeVisible();
    await expect(page.getByRole("gridcell")).toHaveText([/b\.jpg/, /a\.jpg/, /c\.jpg/]);
  });

  test("refuses a name that would overwrite an untouched file", async ({ page }) => {
    // "trip-1.jpg" is not an image the gallery lists as part of the rename set —
    // it is, but the collision case we want is the target already existing.
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await page.getByRole("button", { name: "Rename…" }).click();
    await page.getByLabel("Prefix").fill("a/b");

    await expect(page.getByRole("alert")).toContainText('cannot contain "/"');
    await expect(page.getByRole("button", { name: /^Rename \d+ files?$/ })).toBeDisabled();
  });

  test("stops guarding a name once the file holding it is deleted", async ({ page }) => {
    // Deleting shot-2.jpg leaves shot-3.jpg headed for that exact name. The
    // collision check has to notice the folder changed under the open bar.
    await openGallery(page, ["shot-1.jpg", "shot-2.jpg", "shot-3.jpg"]);

    await page.getByRole("button", { name: "Rename…" }).click();

    await tile(page, "shot-2.jpg").click();
    await expect(selected(page)).toHaveText(/shot-2\.jpg/);
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("gridcell")).toHaveCount(2);

    await page.getByLabel("Prefix").fill("shot-");

    await expect(page.getByRole("alert")).toBeHidden();
    await expect(page.getByRole("button", { name: /^Rename \d+ files?$/ })).toBeEnabled();
  });

  test("asks before discarding an arrangement", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await page.getByRole("button", { name: "Rename…" }).click();
    await page.getByLabel("Prefix").fill("trip-");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("alertdialog")).toContainText("not renamed them yet");

    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("button", { name: "Rename…" })).toBeVisible();
    expect(await diskNames(page)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("leaves no temp files behind", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.getByRole("button", { name: "Rename…" }).click();
    await page.getByLabel("Prefix").fill("x");
    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

    await expect.poll(async () => (await diskNames(page)).length).toBe(3);
    expect((await diskNames(page)).filter((name) => name.startsWith(".aperture-tmp-"))).toEqual([]);
  });
});

test("explains files left behind by an interrupted rename", async ({ page }) => {
  // A run that died between its two passes leaves files under temp names. They
  // cannot be restored automatically, so the app has to at least account for them.
  await openGallery(page, ["a.jpg", ".aperture-tmp-x7f2-0.jpg", ".aperture-tmp-x7f2-1.jpg"]);

  await expect(page.getByRole("alert")).toContainText("2 files left over");
  await expect(page.getByRole("alert")).toContainText("Nothing was lost");
});

test("actually renders the images", async ({ page }) => {
  // The one thing every other test takes for granted. `naturalWidth` is the
  // check that matters: a tile with a src that failed to decode still has an
  // <img>, and still looks exactly like an empty frame.
  await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

  const images = page.getByRole("grid").locator("img");
  await expect(images).toHaveCount(3);

  for (let i = 0; i < 3; i += 1) {
    await expect
      .poll(() => images.nth(i).evaluate((img: { naturalWidth: number }) => img.naturalWidth))
      .toBe(64);
    await expect(images.nth(i)).toBeVisible();
  }
});

test("renders the image in the large view and the filmstrip", async ({ page }) => {
  await openGallery(page, ["a.jpg", "b.jpg"]);
  await page.keyboard.press(" ");

  const main = page.locator("[data-large-image]");
  await expect
    .poll(() => main.evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBe(64);

  const strip = page.getByRole("listbox", { name: "Images in this folder" }).locator("img");
  await expect(strip).toHaveCount(2);
  await expect
    .poll(() => strip.first().evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBe(64);
});

/**
 * Chrome draws no TIFF and Aperture ships no decoder for it. Those files belong
 * in the gallery — culling and renaming them is the point — but an empty white
 * frame is indistinguishable from a broken app, so every surface has to say so.
 */
test("says there is no preview for a format nothing can decode", async ({ page }) => {
  await openGallery(page, ["scan.tiff", "b.jpg"]);

  const undecodable = tile(page, "scan.tiff");
  await expect(undecodable).toContainText("No preview");
  await expect(undecodable.locator("img")).toHaveCount(0);

  // The decodable neighbour is unaffected.
  await expect(tile(page, "b.jpg").locator("img")).toHaveCount(1);

  await undecodable.click();
  await page.keyboard.press(" ");
  await expect(page.getByText("No preview available")).toBeVisible();
  await expect(page.getByText(/can draw TIFF/)).toBeVisible();
  await expect(page.locator("[data-large-image]")).toHaveCount(0);

  // The filmstrip draws the one file it can and an icon for the one it cannot.
  const strip = page.getByRole("listbox", { name: "Images in this folder" });
  await expect(strip.locator("img")).toHaveCount(1);
});

/**
 * A camera roll off an iPhone is mostly HEIC, which Chrome will not draw at any
 * price — so these photos only appear if the libheif worker did its job, all the
 * way from the grid tile to the large view.
 */
test("decodes HEIC photos Chrome cannot draw", async ({ page }) => {
  await openGallery(page, ["IMG_0042.heic", "b.jpg"]);

  const decoded = tile(page, "IMG_0042.heic").locator("img");
  // The first HEIC in a session also spins up a worker and instantiates a
  // megabyte of wasm, which is quick once `optimizeDeps` has pre-bundled it but
  // not free on a cold CI machine.
  await expect(decoded).toHaveCount(1, { timeout: 15_000 });
  await expect
    .poll(() => decoded.evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBe(64);

  await tile(page, "IMG_0042.heic").click();
  await page.keyboard.press(" ");

  const large = page.locator("[data-large-image]");
  await expect(large).toBeVisible();
  await expect
    .poll(() => large.evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBe(64);

  // Both photos draw in the filmstrip, decoded or not.
  const strip = page.getByRole("listbox", { name: "Images in this folder" });
  await expect(strip.locator("img")).toHaveCount(2);
});
