import { describe, expect, it } from "vite-plus/test";
import { jpegWithDateTaken } from "./fs/fixtures";
import { MemoryAdapter, type MemoryFile } from "./fs/memory-adapter";
import { sortEntries } from "./sort";

async function entriesOf(files: Array<MemoryFile | string>) {
  return new MemoryAdapter(files).list();
}

const names = (entries: Array<{ name: string }>) => entries.map((entry) => entry.name);

/** Real JPEG bytes carrying that EXIF date and nothing else. */
const dated = (wallClock: string) => jpegWithDateTaken(wallClock);

describe("sortEntries", () => {
  it("sorts numbers the way a person reads them", async () => {
    const entries = await entriesOf(["IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg"]);

    expect(names(sortEntries(entries, { field: "name", direction: "asc" }))).toEqual([
      "IMG_1.jpg",
      "IMG_2.jpg",
      "IMG_10.jpg",
    ]);
  });

  it("reverses on descending", async () => {
    const entries = await entriesOf(["a.jpg", "b.jpg", "c.jpg"]);

    expect(names(sortEntries(entries, { field: "name", direction: "desc" }))).toEqual([
      "c.jpg",
      "b.jpg",
      "a.jpg",
    ]);
  });

  it("ignores case when ordering by name", async () => {
    const entries = await entriesOf(["beta.jpg", "Alpha.jpg", "gamma.jpg"]);

    expect(names(sortEntries(entries, { field: "name", direction: "asc" }))).toEqual([
      "Alpha.jpg",
      "beta.jpg",
      "gamma.jpg",
    ]);
  });

  it("orders names that differ only by case deterministically", async () => {
    const entries = await entriesOf(["PHOTO.jpg", "photo.JPG"]);
    const once = names(sortEntries(entries, { field: "name", direction: "asc" }));
    const twice = names(sortEntries([...entries].reverse(), { field: "name", direction: "asc" }));

    expect(once).toEqual(twice);
  });

  it("sorts by date modified", async () => {
    const entries = await entriesOf([
      { name: "new.jpg", lastModified: 3000 },
      { name: "old.jpg", lastModified: 1000 },
      { name: "mid.jpg", lastModified: 2000 },
    ]);

    expect(names(sortEntries(entries, { field: "modified", direction: "asc" }))).toEqual([
      "old.jpg",
      "mid.jpg",
      "new.jpg",
    ]);
  });

  it("falls back to name when timestamps tie", async () => {
    const entries = await entriesOf([
      { name: "b.jpg", lastModified: 1000 },
      { name: "a.jpg", lastModified: 1000 },
    ]);

    expect(names(sortEntries(entries, { field: "modified", direction: "asc" }))).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("sorts by the date in the file, not the date on the file", async () => {
    // Modified dates ascend with the names; EXIF says the opposite. Renaming
    // rewrites the first and leaves the second alone, so this is what happens
    // after every rename Aperture performs.
    const entries = await entriesOf([
      { name: "a.jpg", lastModified: 1000, bytes: dated("2021:03:03 10:00:00") },
      { name: "b.jpg", lastModified: 2000, bytes: dated("2021:02:02 10:00:00") },
      { name: "c.jpg", lastModified: 3000, bytes: dated("2021:01:01 10:00:00") },
    ]);

    expect(names(sortEntries(entries, { field: "taken", direction: "asc" }))).toEqual([
      "c.jpg",
      "b.jpg",
      "a.jpg",
    ]);
  });

  it("places a file with no EXIF date by its modified date", async () => {
    const taken = (wall: string) => Date.parse(wall);
    const entries = await entriesOf([
      { name: "early.jpg", bytes: dated("2021:01:01 10:00:00") },
      { name: "late.jpg", bytes: dated("2021:03:03 10:00:00") },
      // A screenshot: no EXIF, and a modified date that falls between the two.
      { name: "screenshot.png", lastModified: taken("2021-02-02T10:00:00") },
    ]);

    expect(names(sortEntries(entries, { field: "taken", direction: "asc" }))).toEqual([
      "early.jpg",
      "screenshot.png",
      "late.jpg",
    ]);
  });

  it("falls back to name when dates taken tie", async () => {
    const bytes = dated("2021:01:01 10:00:00");
    const entries = await entriesOf([
      { name: "b.jpg", bytes },
      { name: "a.jpg", bytes },
    ]);

    expect(names(sortEntries(entries, { field: "taken", direction: "asc" }))).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("reverses date taken on descending", async () => {
    const entries = await entriesOf([
      { name: "early.jpg", bytes: dated("2021:01:01 10:00:00") },
      { name: "late.jpg", bytes: dated("2021:03:03 10:00:00") },
    ]);

    expect(names(sortEntries(entries, { field: "taken", direction: "desc" }))).toEqual([
      "late.jpg",
      "early.jpg",
    ]);
  });

  it("does not mutate the input", async () => {
    const entries = await entriesOf(["c.jpg", "a.jpg", "b.jpg"]);
    const before = names(entries);

    sortEntries(entries, { field: "name", direction: "asc" });

    expect(names(entries)).toEqual(before);
  });
});
