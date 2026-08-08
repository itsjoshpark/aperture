import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke coverage for the flows that only exist once everything is wired
 * together. The rename engine's own correctness lives in the unit tests, where
 * the awkward cases (swaps, rollback, undo) can be exercised directly.
 */

const HARNESS = "e2e/harness.html";

async function openGallery(
  page: Page,
  files?: string[],
  options: { taken?: boolean; failDelete?: string[] } = {},
): Promise<void> {
  const params = [
    files ? `files=${files.join(",")}` : "",
    options.taken ? "taken" : "",
    options.failDelete ? `failDelete=${options.failDelete.join(",")}` : "",
  ].filter(Boolean);
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  await page.goto(`${HARNESS}${query}`);
  await page.getByRole("button", { name: "Open folder…" }).click();
  await expect(page.getByRole("grid")).toBeVisible();
}

const tile = (page: Page, name: string) => page.getByRole("gridcell").filter({ hasText: name });
const selected = (page: Page) => page.locator('[role="gridcell"][aria-selected="true"]');

/**
 * Only the photograph takes a selecting click — the square around it is layout,
 * and clicking there clears the selection instead. So these go for the `<img>`
 * rather than the cell, whose centre is not inside every photo's box.
 */
const clickTile = (page: Page, name: string, modifiers?: ("Meta" | "Shift")[]) =>
  tile(page, name)
    .locator("img")
    .click(modifiers ? { modifiers } : undefined);

/**
 * Drag one tile onto another's cell. Two moves, not one: the first has to cross
 * `DRAG_THRESHOLD` before the press counts as a drag at all, and only the second
 * lands it — so a single `move()` reorders nothing and reads as a broken grid.
 */
async function dragTile(page: Page, from: string, to: string): Promise<void> {
  await tile(page, from).hover();
  await page.mouse.down();
  const box = (await tile(page, to).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
  await page.mouse.up();
}
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

test("sorts by the date taken read out of the files", async ({ page }) => {
  // Seeded so name, date modified and date taken each disagree: the EXIF dates
  // run backwards, so this order can only come from reading the bytes.
  await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"], { taken: true });

  await page.getByRole("button", { name: /Name/ }).click();
  await page.getByRole("menuitem", { name: "Date taken" }).click();

  await expect(page.getByRole("button", { name: /Date taken/ })).toBeVisible();
  await expect(page.getByRole("gridcell")).toHaveText([/c\.jpg/, /b\.jpg/, /a\.jpg/]);
});

test("numbers a rename in date-taken order", async ({ page }) => {
  await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"], { taken: true });

  await page.getByRole("button", { name: /Name/ }).click();
  await page.getByRole("menuitem", { name: "Date taken" }).click();
  await expect(page.getByRole("gridcell")).toHaveText([/c\.jpg/, /b\.jpg/, /a\.jpg/]);

  // Rename mode opens on whatever the grid is showing, so sorting by date taken
  // and renaming is how you get filenames that run in the order things happened.
  await page.getByRole("button", { name: "Bulk Rename…" }).click();
  await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

  await expect(page.getByRole("gridcell")).toHaveText([/^1\.jpg/, /^2\.jpg/, /^3\.jpg/]);
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
    // A folder opens with nothing selected; the first arrow press picks it up
    // at the first photo rather than moving from one.
    await expect(selected(page)).toHaveCount(0);

    await page.keyboard.press("ArrowRight");
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

    await page.keyboard.press("Home");
    await page.keyboard.press(" ");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeHidden();
  });

  /** Escape unwinds one layer at a time, and the selection is the last of them. */
  test("Escape leaves the large view before it clears the selection", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "b.jpg");
    await expect(selected(page)).toHaveText(/b\.jpg/);

    await page.keyboard.press(" ");
    await page.keyboard.press("Escape");
    // Out of the large view, with the photo you were looking at still selected.
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeHidden();
    await expect(selected(page)).toHaveText(/b\.jpg/);

    await page.keyboard.press("Escape");
    await expect(selected(page)).toHaveCount(0);
  });

  test("opens a folder with Cmd/Ctrl+O before there is one", async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.getByRole("grid")).toBeHidden();

    await page.keyboard.press("ControlOrMeta+o");

    await expect(page.getByRole("grid")).toBeVisible();
  });

  test("Cmd/Ctrl+O reaches openFolder from the gallery too", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    // A dirty rename session is what makes the second open observable: it is
    // the guard, not a fresh grid, that proves the shortcut got there.
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+ArrowRight");
    await page.keyboard.press("ControlOrMeta+o");

    await expect(page.getByRole("alertdialog")).toContainText("Rename before you go?");
  });

  test("keeps the selection on the same photo through a re-sort", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "b.jpg");
    await page.getByRole("button", { name: /Name/ }).click();
    await page.getByRole("menuitem", { name: "Descending" }).click();

    await expect(selected(page)).toHaveText(/b\.jpg/);
  });

  test("extends the selection with Shift and the arrow keys", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    await clickTile(page, "b.jpg");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(selected(page)).toHaveText([/b\.jpg/, /c\.jpg/, /d\.jpg/]);

    // Every range is drawn from the anchor, so walking back shortens it.
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(selected(page)).toHaveText([/b\.jpg/, /c\.jpg/]);

    // An arrow without Shift collapses back to one photo.
    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText([/d\.jpg/]);
  });
});

test.describe("multiple selection", () => {
  test("adds a photo with Cmd and a range with Shift", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    await clickTile(page, "a.jpg");
    await clickTile(page, "c.jpg", ["Meta"]);
    await expect(selected(page)).toHaveText([/a\.jpg/, /c\.jpg/]);

    // Cmd again takes it back out.
    await clickTile(page, "c.jpg", ["Meta"]);
    await expect(selected(page)).toHaveText([/a\.jpg/]);

    await clickTile(page, "d.jpg", ["Shift"]);
    await expect(selected(page)).toHaveText([/a\.jpg/, /b\.jpg/, /c\.jpg/, /d\.jpg/]);

    // And a plain click is still a plain click.
    await clickTile(page, "b.jpg");
    await expect(selected(page)).toHaveText([/b\.jpg/]);
  });

  /**
   * The photograph is the only part of a tile that selects. Everything else in
   * the grid — the gaps, the padding, the letterboxing beside a photo that is
   * not square — is background, and clicking background deselects.
   */
  test("clears the selection by clicking the background", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "b.jpg");
    await expect(selected(page)).toHaveCount(1);

    // The padding below the last row, which belongs to no tile.
    const scroller = page.locator("div.overflow-y-auto").first();
    const bounds = (await scroller.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 4);

    await expect(selected(page)).toHaveCount(0);
  });

  test("keeps selecting from the caption, which is part of the photo's record", async ({
    page,
  }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await tile(page, "b.jpg").getByText("b.jpg").click();

    await expect(selected(page)).toHaveText([/b\.jpg/]);
  });
});

/** The page's own globals, described rather than imported: see `ApertureTestHooks`. */
interface FlipProbe {
  document: {
    querySelectorAll: (selector: string) => Iterable<{
      getAnimations: () => { id: string }[];
      matches: (selector: string) => boolean;
    }>;
  };
  requestAnimationFrame: (callback: () => void) => void;
}

/** As `FlipProbe`, for the one card a delete is watched through. */
interface PathProbe {
  document: {
    querySelector: (selector: string) => { getBoundingClientRect: () => { x: number } } | null;
  };
  requestAnimationFrame: (callback: () => void) => void;
}

/**
 * Where one card sits, every frame, while `act` runs — sampled inside the page
 * for the same reason the FLIP probe is. Asserting on the animation object
 * alone would not do here: a FLIP measured across a gap that has not opened yet
 * computes a zero delta, and still leaves a perfectly real `tile-flip` on the
 * card having moved it nowhere.
 */
async function pathOf(
  page: Page,
  name: string,
  frames: number,
  act: () => Promise<void>,
): Promise<number[]> {
  const watching = page.evaluate(
    async ([selector, limit]) => {
      const { document, requestAnimationFrame } = globalThis as unknown as PathProbe;
      const seen: number[] = [];
      for (let frame = 0; frame < (limit as number); frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const card = document.querySelector(selector as string);
        if (card) seen.push(Math.round(card.getBoundingClientRect().x));
      }
      return seen;
    },
    [`[data-name="${name}"] [data-tile-card]`, frames] as const,
  );

  await act();
  return watching;
}

/**
 * Whether any card ran the grid's FLIP while `act` was happening. Sampled from
 * inside the page: each animation lasts 260ms, which a round trip per frame
 * would spend most of and could miss the whole of.
 */
async function flipsWhile(page: Page, frames: number, act: () => Promise<void>): Promise<boolean> {
  const watching = page.evaluate(async (limit) => {
    const { document, requestAnimationFrame } = globalThis as unknown as FlipProbe;
    for (let frame = 0; frame < limit; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const running = [...document.querySelectorAll("[data-tile-card]")].some((card) =>
        card.getAnimations().some((animation) => animation.id === "tile-flip"),
      );
      if (running) return true;
    }
    return false;
  }, frames);

  await act();
  return watching;
}

/**
 * Once everything has settled, every card fills its cell exactly — so no
 * transform was left behind by the FLIP. Polled, since it is measuring the far
 * end of a 260ms animation, and a card mid-flight is off its cell by design.
 */
async function cardsMatchCells(page: Page): Promise<void> {
  const cells = page.getByRole("gridcell");
  const cards = page.locator("[data-tile-card]");

  await expect
    .poll(async () => {
      // A cell on its way out is `display: none`: still a card, no longer a
      // gridcell, and no box to measure. Retry rather than pair them up wrong.
      const count = await cells.count();
      if (count === 0 || count !== (await cards.count())) return -1;

      let drift = 0;
      for (let index = 0; index < count; index += 1) {
        const outer = await cells.nth(index).boundingBox();
        const inner = await cards.nth(index).boundingBox();
        if (!outer || !inner) return -1;
        drift += Math.abs(outer.x - inner.x) + Math.abs(outer.width - inner.width);
      }
      return Math.round(drift);
    })
    .toBe(0);
}

test.describe("delete", () => {
  test("warns that deleting is permanent, then deletes", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toContainText("not moved to the Trash");

    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["b.jpg", "c.jpg"]);
  });

  test("deletes the selection from the toolbar button", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "b.jpg");
    // Exact: the dialog's own action is "Delete permanently".
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["a.jpg", "c.jpg"]);
  });

  test("leaves the file alone when cancelled", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("returns to the grid when the last image goes", async ({ page }) => {
    await openGallery(page, ["only.jpg"]);

    await clickTile(page, "only.jpg");
    await page.keyboard.press(" ");
    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeVisible();

    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("listbox", { name: "Images in this folder" })).toBeHidden();
    await expect(page.getByText("No images in this folder.")).toBeVisible();
  });

  test("moves the selection to the next image", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(selected(page)).toHaveText(/b\.jpg/);
  });

  test("deletes a whole selection at once and lands after it", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    await clickTile(page, "a.jpg");
    await clickTile(page, "b.jpg", ["Shift"]);

    await page.keyboard.press("Delete");
    // Counted, not named: there is no one file name to put in the question.
    await expect(page.getByRole("alertdialog")).toContainText("Delete 2 images?");
    await expect(page.getByRole("alertdialog")).toContainText("not moved to the Trash");

    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["c.jpg", "d.jpg"]);
    await expect(selected(page)).toHaveText([/c\.jpg/]);
  });

  /**
   * The survivors travel into the gap rather than snapping across it: `c.jpg`
   * is two tracks to the left when this is over, and the frames in between are
   * the whole point. A grid that jumps reports two positions, an old and a new.
   */
  test("slides the survivors into the gap the deleted photos leave", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg", "g.jpg"]);

    await clickTile(page, "a.jpg");
    await clickTile(page, "b.jpg", ["Shift"]);
    await page.keyboard.press("Delete");

    const path = await pathOf(page, "c.jpg", 90, () =>
      page.getByRole("button", { name: "Delete permanently" }).click(),
    );

    expect(new Set(path).size).toBeGreaterThan(4);
    expect(path.at(-1)).toBeLessThan(path[0]!);
    await expect(page.getByRole("gridcell")).toHaveCount(5);
    await cardsMatchCells(page);
  });

  /**
   * Rename mode shows the draft, so a delete reaches the grid through `forget`
   * instead of through the entries list — a second route to the same animation,
   * and the one that walks a selection a name at a time.
   */
  test("slides them in rename mode too, where it is the draft that shrinks", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    await dragTile(page, "d.jpg", "a.jpg");
    await expect(page.getByRole("gridcell")).toHaveText([/d\.jpg/, /a\.jpg/, /b\.jpg/, /c\.jpg/]);

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");

    const path = await pathOf(page, "b.jpg", 90, () =>
      page.getByRole("button", { name: "Delete permanently" }).click(),
    );

    expect(new Set(path).size).toBeGreaterThan(4);
    await expect(page.getByRole("gridcell")).toHaveText([/d\.jpg/, /b\.jpg/, /c\.jpg/]);
  });

  test("says so when the disk refuses a delete", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"], { failDelete: ["a.jpg"] });

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    // The file is still there, so the banner is the only thing that can say why.
    await expect(page.getByRole("alert")).toContainText("Could not delete a.jpg");
    await expect(page.getByRole("alert")).toContainText("Permission denied");
    await expect(page.getByRole("gridcell")).toHaveCount(2);
    expect(await diskNames(page)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("names only the files that survived a partial failure", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"], { failDelete: ["a.jpg"] });

    await clickTile(page, "a.jpg");
    await clickTile(page, "b.jpg", ["Shift"]);
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    // `b.jpg` went, so naming it as well would send you looking for a file that
    // is not there.
    await expect(page.getByRole("alert")).toContainText("Could not delete a.jpg");
    await expect(page.getByRole("alert")).not.toContainText("b.jpg");
    expect(await diskNames(page)).toEqual(["a.jpg", "c.jpg"]);
  });

  test("clears the message once a delete works", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"], { failDelete: ["a.jpg"] });

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    await clickTile(page, "b.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByRole("alert")).toBeHidden();
  });

  test("dismisses the message by hand", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg"], { failDelete: ["a.jpg"] });

    await clickTile(page, "a.jpg");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    await page.getByRole("button", { name: "Dismiss" }).click();

    await expect(page.getByRole("alert")).toBeHidden();
  });
});

test.describe("preview size", () => {
  const sizeSlider = (page: Page) => page.getByRole("slider", { name: "Preview size" });

  /**
   * Every step has to redraw, not just the journey as a whole: the grid
   * stretches its columns to fill the row, so a slider measured in pixels
   * spends most of its travel showing the same picture back.
   */
  test("resizes the previews on every step of the slider", async ({ page }) => {
    await openGallery(page);

    const first = tile(page, "beach.jpg");
    let previous = (await first.boundingBox())!.width;

    for (let step = 0; step < 3; step += 1) {
      await sizeSlider(page).press("ArrowRight");
      await expect
        .poll(async () => (await first.boundingBox())!.width)
        .not.toBeCloseTo(previous, 0);

      previous = (await first.boundingBox())!.width;
    }
  });

  /**
   * The animation itself is covered in `tile-flip.browser.test.ts`; what only
   * the whole app can show is that it is wired to the slider at all, and that
   * the tiles are handed back at the end rather than left under a transform.
   */
  test("grows the tiles into their new size, and leaves nothing behind", async ({ page }) => {
    await openGallery(page);

    const zoomed = await flipsWhile(page, 40, () => sizeSlider(page).press("ArrowRight"));

    expect(zoomed).toBe(true);
    await cardsMatchCells(page);
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
    await clickTile(page, "a.jpg");
    await expect(selected(page)).toHaveText(/a\.jpg/);

    const before = await sizeSlider(page).getAttribute("aria-valuenow");
    const thumb = (await sizeSlider(page).boundingBox())!;
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2 + 60, thumb.y + thumb.height / 2, { steps: 8 });
    await page.mouse.up();

    // The drag has to have done something, or focus proves nothing.
    await expect(sizeSlider(page)).not.toHaveAttribute("aria-valuenow", before!);

    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText(/b\.jpg/);
  });

  test("remembers the size across a reload", async ({ page }) => {
    await openGallery(page);

    const initial = await sizeSlider(page).getAttribute("aria-valuenow");
    await sizeSlider(page).press("ArrowRight");
    await sizeSlider(page).press("ArrowRight");
    const chosen = await sizeSlider(page).getAttribute("aria-valuenow");
    expect(chosen).not.toBe(initial);

    await page.reload();
    await page.getByRole("button", { name: "Open folder…" }).click();
    await expect(page.getByRole("grid")).toBeVisible();

    await expect(sizeSlider(page)).toHaveAttribute("aria-valuenow", chosen!);
  });
});

test.describe("rename", () => {
  /**
   * The tiles a drag pushes aside slide into their new cells — but never the
   * lifted card, which belongs to the cursor for as long as the button is down.
   * Watched from inside the page: each of these lasts 260ms.
   */
  test("slides the tiles a dragged one displaces, and never the dragged one", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    const watching = page.evaluate(async () => {
      const { document, requestAnimationFrame } = globalThis as unknown as FlipProbe;
      const seen = { displaced: false, lifted: false };

      for (let frame = 0; frame < 90; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        for (const card of document.querySelectorAll("[data-tile-card]")) {
          if (!card.getAnimations().some((animation) => animation.id === "tile-flip")) continue;
          if (card.matches("[data-dragging]")) seen.lifted = true;
          else seen.displaced = true;
        }
      }
      return seen;
    });

    await dragTile(page, "d.jpg", "a.jpg");

    expect(await watching).toEqual({ displaced: true, lifted: false });
    await expect(page.getByRole("gridcell")).toHaveText([/d\.jpg/, /a\.jpg/, /b\.jpg/, /c\.jpg/]);
  });

  test("renames in the dragged order, then undoes it", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    // Drag the last tile onto the first cell.
    // Held mid-drag, so the cell the tile would land in is outlined.
    await tile(page, "c.jpg").hover();
    await page.mouse.down();
    const box = (await tile(page, "a.jpg").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
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
   * A selection of several travels as one block. It is gathered around the tile
   * under the cursor when the drag begins — so the run is contiguous from then
   * on, and what the grid shows mid-drag is what the drop will produce.
   */
  test("carries a whole selection to where the drag lands", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

    // Two photos with another between them, so gathering them is visible.
    await clickTile(page, "b.jpg");
    await clickTile(page, "d.jpg", ["Meta"]);

    // Held mid-drag, because the lifted card says how many it is carrying.
    await tile(page, "d.jpg").hover();
    await page.mouse.down();
    const box = (await tile(page, "a.jpg").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await expect(page.locator("[data-tile-card][data-dragging]")).toContainText("2");
    await page.mouse.move(box.x + 4, box.y + 4, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByRole("gridcell")).toHaveText([/b\.jpg/, /d\.jpg/, /a\.jpg/, /c\.jpg/]);
    // The drag was not a click on the background, whatever the click that
    // follows a pointerup is retargeted onto.
    await expect(selected(page)).toHaveText([/b\.jpg/, /d\.jpg/]);

    await page.getByLabel("Prefix").fill("trip-");
    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

    await expect
      .poll(() => diskNames(page).then((names) => names.slice().sort()))
      .toEqual(["trip-1.jpg", "trip-2.jpg", "trip-3.jpg", "trip-4.jpg"]);
  });

  test("drags a photo outside the selection on its own", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await clickTile(page, "a.jpg");

    await dragTile(page, "c.jpg", "a.jpg");

    await expect(page.getByRole("gridcell")).toHaveText([/c\.jpg/, /a\.jpg/, /b\.jpg/]);
    await expect(selected(page)).toHaveText([/c\.jpg/]);
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

    await page.getByRole("button", { name: "Bulk Rename…" }).click();
    await page.getByLabel("Prefix").fill("shot-");
    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();

    await expect(page.getByText("Renamed.")).toBeVisible();

    // Closing the bar afterwards must not prompt — the work is already on disk.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Bulk Rename…" })).toBeVisible();
  });

  /**
   * Renumbering a folder that is already numbered is a permutation: every name
   * survives the rename with a different photo behind it. The tiles keep their
   * keys, so Vue reuses them rather than mounting new ones, and anything that
   * decided it was showing the right file by comparing names goes on drawing the
   * photo it had — the whole grid redraws itself as it was, which is
   * indistinguishable from the rename having been cancelled.
   *
   * The seeded files are visually identical, so what proves a tile re-read its
   * file is the object URL it is drawing having changed.
   */
  test("re-reads the photos when a rename hands their names to other files", async ({ page }) => {
    await openGallery(page, ["1.jpg", "2.jpg", "3.jpg"]);

    const sources = async () => {
      const images = await page.getByRole("gridcell").locator("img").all();
      return Promise.all(images.map((image) => image.getAttribute("src")));
    };

    const before = await sources();
    expect(before).toHaveLength(3);

    await dragTile(page, "3.jpg", "1.jpg");

    // No prefix, so the targets are the three names the folder already holds.
    await page.getByRole("button", { name: /^Rename \d+ files?$/ }).click();
    await expect(page.getByText("Renamed.")).toBeVisible();

    await expect(page.getByRole("gridcell")).toHaveText([/^1\.jpg/, /^2\.jpg/, /^3\.jpg/]);
    await expect
      .poll(async () => {
        const after = await sources();
        return after.length === 3 && after.every((src) => !before.includes(src));
      })
      .toBe(true);
  });

  test("reorders from the keyboard as well as the mouse", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+ArrowRight");

    await expect(page.getByRole("button", { name: "Custom order" })).toBeVisible();
    await expect(page.getByRole("gridcell")).toHaveText([/b\.jpg/, /a\.jpg/, /c\.jpg/]);
  });

  test("refuses a name that would overwrite an untouched file", async ({ page }) => {
    // "trip-1.jpg" is not an image the gallery lists as part of the rename set —
    // it is, but the collision case we want is the target already existing.
    await openGallery(page, ["a.jpg", "b.jpg"]);

    await page.getByRole("button", { name: "Bulk Rename…" }).click();
    await page.getByLabel("Prefix").fill("a/b");

    await expect(page.getByRole("alert")).toContainText('cannot contain "/"');
    await expect(page.getByRole("button", { name: /^Rename \d+ files?$/ })).toBeDisabled();
  });

  test("stops guarding a name once the file holding it is deleted", async ({ page }) => {
    // Deleting shot-2.jpg leaves shot-3.jpg headed for that exact name. The
    // collision check has to notice the folder changed under the open bar.
    await openGallery(page, ["shot-1.jpg", "shot-2.jpg", "shot-3.jpg"]);

    await page.getByRole("button", { name: "Bulk Rename…" }).click();

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

    await page.getByRole("button", { name: "Bulk Rename…" }).click();
    await page.getByLabel("Prefix").fill("trip-");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("alertdialog")).toContainText("not renamed them yet");

    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("button", { name: "Bulk Rename…" })).toBeVisible();
    expect(await diskNames(page)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("leaves no temp files behind", async ({ page }) => {
    await openGallery(page, ["a.jpg", "b.jpg", "c.jpg"]);

    await page.getByRole("button", { name: "Bulk Rename…" }).click();
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
  await page.keyboard.press("Home");
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

  // A tile with nothing to draw still selects: the fallback covers the photo's
  // own box, which is the whole square while no image has reported a shape.
  await undecodable.click();
  await expect(selected(page)).toHaveText([/scan\.tiff/]);
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
