import { describe, expect, it } from "vite-plus/test";
import { MemoryAdapter, type MemoryFile } from "./fs/memory-adapter";
import { sortEntries } from "./sort";

async function entriesOf(files: Array<MemoryFile | string>) {
  return new MemoryAdapter(files).list();
}

const names = (entries: Array<{ name: string }>) => entries.map((entry) => entry.name);

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

    expect(names(sortEntries(entries, { field: "date", direction: "asc" }))).toEqual([
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

    expect(names(sortEntries(entries, { field: "date", direction: "asc" }))).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("does not mutate the input", async () => {
    const entries = await entriesOf(["c.jpg", "a.jpg", "b.jpg"]);
    const before = names(entries);

    sortEntries(entries, { field: "name", direction: "asc" });

    expect(names(entries)).toEqual(before);
  });
});
