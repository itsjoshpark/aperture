import { beforeEach, expect, test } from "vite-plus/test";
import { nextTick } from "vue";
import { DEFAULT_TILE_SIZE, MAX_TILE_SIZE, MIN_TILE_SIZE, useGallery } from "./useGallery";

/**
 * Preview size is the one piece of state that outlives the tab, so it is also
 * the one piece read back from somewhere we do not control. These run in the
 * browser project because node has no `localStorage` — testing this against a
 * hand-written stub would only prove the stub works.
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
