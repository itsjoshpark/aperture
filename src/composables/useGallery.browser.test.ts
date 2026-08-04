import { beforeEach, describe, expect, test } from "vite-plus/test";
import { nextTick } from "vue";
import { MemoryAdapter } from "@/lib/fs/memory-adapter";
import { DEFAULT_TILE_SIZE, MAX_TILE_SIZE, MIN_TILE_SIZE, useGallery } from "./useGallery";

/**
 * Preview size is the one piece of state that outlives the tab, so it is also
 * the one piece read back from somewhere we do not control. These run in the
 * browser project because node has no `localStorage` — testing this against a
 * hand-written stub would only prove the stub works, and the selection tests
 * below follow them here because `useGallery` reads it on construction.
 */

const KEY = "aperture:tile-size";

beforeEach(() => {
  localStorage.removeItem(KEY);
});

test("starts at the default when nothing has been stored", () => {
  expect(useGallery().tileSize.value).toBe(DEFAULT_TILE_SIZE);
});

test("restores the size chosen in an earlier session", () => {
  localStorage.setItem(KEY, "248");

  expect(useGallery().tileSize.value).toBe(248);
});

test("saves the size as soon as it changes", async () => {
  const gallery = useGallery();

  gallery.tileSize.value = 96;
  await nextTick();

  expect(localStorage.getItem(KEY)).toBe("96");
});

test("clamps a stored size that falls outside the slider's range", () => {
  localStorage.setItem(KEY, "5000");
  expect(useGallery().tileSize.value).toBe(MAX_TILE_SIZE);

  localStorage.setItem(KEY, "-40");
  expect(useGallery().tileSize.value).toBe(MIN_TILE_SIZE);
});

test("falls back to the default when the stored value is not a size", () => {
  for (const junk of ["", "   ", "large", "NaN", "{}"]) {
    localStorage.setItem(KEY, junk);
    expect(useGallery().tileSize.value).toBe(DEFAULT_TILE_SIZE);
  }
});

/**
 * Three pieces of state move together — the set, the cursor and the anchor —
 * and every gesture below is a different way of writing all three at once. The
 * invariant worth holding onto: the cursor is a member of the set, or the set
 * is empty and there is no cursor.
 */
describe("selection", () => {
  async function openFolder(names = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"]) {
    const gallery = useGallery();
    await gallery.open(new MemoryAdapter(names));
    return gallery;
  }

  const names = (gallery: Awaited<ReturnType<typeof openFolder>>) =>
    gallery.selectedEntriesIn(gallery.sorted.value).map((entry) => entry.name);

  test("opens a folder with nothing selected", async () => {
    const gallery = await openFolder();

    expect(names(gallery)).toEqual([]);
    expect(gallery.selectedName.value).toBeNull();
  });

  test("lands the first arrow press on the first image", async () => {
    const gallery = await openFolder();

    gallery.moveBy("right", 3, gallery.sorted.value);

    expect(gallery.selectedName.value).toBe("a.jpg");
  });

  test("replaces the selection on a plain select", async () => {
    const gallery = await openFolder();

    gallery.toggle("a.jpg", gallery.sorted.value);
    gallery.toggle("c.jpg", gallery.sorted.value);
    gallery.select("e.jpg");

    expect(names(gallery)).toEqual(["e.jpg"]);
  });

  test("toggles a photo in and back out again", async () => {
    const gallery = await openFolder();

    gallery.select("a.jpg");
    gallery.toggle("c.jpg", gallery.sorted.value);
    expect(names(gallery)).toEqual(["a.jpg", "c.jpg"]);

    gallery.toggle("a.jpg", gallery.sorted.value);
    expect(names(gallery)).toEqual(["c.jpg"]);
  });

  test("hands the cursor to a survivor when it is the one toggled off", async () => {
    const gallery = await openFolder();

    gallery.select("a.jpg");
    gallery.toggle("d.jpg", gallery.sorted.value);
    gallery.toggle("d.jpg", gallery.sorted.value);

    expect(names(gallery)).toEqual(["a.jpg"]);
    expect(gallery.selectedName.value).toBe("a.jpg");
  });

  test("leaves no cursor once the last photo is toggled off", async () => {
    const gallery = await openFolder();

    gallery.select("b.jpg");
    gallery.toggle("b.jpg", gallery.sorted.value);

    expect(names(gallery)).toEqual([]);
    expect(gallery.selectedName.value).toBeNull();
  });

  test("selects a range in either direction", async () => {
    const gallery = await openFolder();

    gallery.select("d.jpg");
    gallery.extendTo("b.jpg", gallery.sorted.value);

    expect(names(gallery)).toEqual(["b.jpg", "c.jpg", "d.jpg"]);
    expect(gallery.selectedName.value).toBe("b.jpg");
  });

  test("redraws each range from the same anchor, so it can shrink again", async () => {
    const gallery = await openFolder();

    gallery.select("b.jpg");
    gallery.extendTo("e.jpg", gallery.sorted.value);
    expect(names(gallery)).toEqual(["b.jpg", "c.jpg", "d.jpg", "e.jpg"]);

    // Ranging back towards the anchor shortens the selection rather than
    // extending it from where the last range happened to end.
    gallery.extendTo("c.jpg", gallery.sorted.value);
    expect(names(gallery)).toEqual(["b.jpg", "c.jpg"]);
  });

  test("extends with the arrow keys from the standing anchor", async () => {
    const gallery = await openFolder();

    gallery.select("b.jpg");
    gallery.moveBy("right", 5, gallery.sorted.value, true);
    gallery.moveBy("right", 5, gallery.sorted.value, true);
    expect(names(gallery)).toEqual(["b.jpg", "c.jpg", "d.jpg"]);

    gallery.moveBy("left", 5, gallery.sorted.value, true);
    expect(names(gallery)).toEqual(["b.jpg", "c.jpg"]);
  });

  test("collapses to one photo when an arrow moves without extending", async () => {
    const gallery = await openFolder();

    gallery.select("b.jpg");
    gallery.moveBy("right", 5, gallery.sorted.value, true);
    gallery.moveBy("right", 5, gallery.sorted.value);

    expect(names(gallery)).toEqual(["d.jpg"]);
  });

  test("deletes every selected file and lands on the one after them", async () => {
    const gallery = await openFolder();

    gallery.select("b.jpg");
    gallery.extendTo("c.jpg", gallery.sorted.value);
    await gallery.removeMany(["b.jpg", "c.jpg"], gallery.sorted.value);

    expect(gallery.sorted.value.map((entry) => entry.name)).toEqual(["a.jpg", "d.jpg", "e.jpg"]);
    expect(gallery.allNames.value).not.toContain("b.jpg");
    expect(gallery.selectedName.value).toBe("d.jpg");
  });

  test("falls back to the photo before a run deleted off the end", async () => {
    const gallery = await openFolder();

    await gallery.removeMany(["d.jpg", "e.jpg"], gallery.sorted.value);

    expect(gallery.selectedName.value).toBe("c.jpg");
  });

  test("drops names that a refresh no longer finds", async () => {
    const port = new MemoryAdapter(["a.jpg", "b.jpg", "c.jpg"]);
    const gallery = useGallery();
    await gallery.open(port);

    gallery.select("a.jpg");
    gallery.extendTo("c.jpg", gallery.sorted.value);

    // Renamed out from under the selection, as an apply does to all of them.
    await port.delete("b.jpg");
    await gallery.refresh();

    expect(names(gallery)).toEqual(["a.jpg", "c.jpg"]);
    expect(gallery.selectedName.value).toBe("c.jpg");
  });

  test("clears everything at once", async () => {
    const gallery = await openFolder();

    gallery.select("a.jpg");
    gallery.extendTo("d.jpg", gallery.sorted.value);
    gallery.clearSelection();

    expect(names(gallery)).toEqual([]);
    expect(gallery.selectedName.value).toBeNull();
  });
});
