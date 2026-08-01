import { beforeEach, describe, expect, it } from "vite-plus/test";
import { FsaAdapter } from "./fsa-adapter";

/**
 * `FsaAdapter` against a real File System Access implementation.
 *
 * The origin private file system hands out genuine `FileSystemDirectoryHandle`
 * objects — the same interface `showDirectoryPicker()` returns — so this
 * exercises the adapter against the real API rather than a stand-in. It is the
 * one part of the stack `MemoryAdapter` cannot vouch for.
 */

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAe0lEQVR4nO3PUQkAIBTAwBfHEPZPYRhD+HEIgwW4zVn764YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQwg8HFgABc6zLrQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

let dir: FileSystemDirectoryHandle;

async function write(name: string, bytes: Uint8Array = PNG): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes as unknown as BufferSource);
  await writable.close();
}

async function names(): Promise<string[]> {
  const found: string[] = [];
  for await (const name of dir.keys()) found.push(name);
  return found.sort();
}

beforeEach(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    await root.removeEntry(name, { recursive: true }).catch(() => {});
  }
  dir = await root.getDirectoryHandle("photos", { create: true });
});

describe("list", () => {
  it("returns the images in the folder", async () => {
    await write("beach.jpg");
    await write("sunset.png");

    const entries = await new FsaAdapter(dir).list();

    expect(entries.map((entry) => entry.name).sort()).toEqual(["beach.jpg", "sunset.png"]);
  });

  it("skips files that are not images", async () => {
    await write("beach.jpg");
    await write("notes.txt");

    const entries = await new FsaAdapter(dir).list();

    expect(entries.map((entry) => entry.name)).toEqual(["beach.jpg"]);
  });

  it("splits base and extension, preserving case", async () => {
    await write("IMG_0042.JPG");

    const [entry] = await new FsaAdapter(dir).list();

    expect(entry).toMatchObject({ name: "IMG_0042.JPG", base: "IMG_0042", ext: ".JPG" });
  });

  it("reports the real size and modification time", async () => {
    await write("beach.jpg");

    const [entry] = await new FsaAdapter(dir).list();

    expect(entry!.size).toBe(PNG.byteLength);
    expect(entry!.lastModified).toBeGreaterThan(0);
  });

  it("hands back a readable File", async () => {
    // This is the whole point of an entry: a tile turns it into an object URL
    // and shows it. If the bytes do not survive, every preview is blank.
    await write("beach.jpg");

    const [entry] = await new FsaAdapter(dir).list();
    const file = await entry!.getFile();

    expect(file.size).toBe(PNG.byteLength);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
  });

  it("still reads a file after the listing has been walked", async () => {
    // The handle is captured in a closure inside a `for await` loop; if that
    // capture were wrong, every entry would read the last file — or throw.
    await write("a.jpg", Uint8Array.from([1, 2, 3]));
    await write("b.jpg", Uint8Array.from([4, 5, 6, 7]));

    const entries = await new FsaAdapter(dir).list();
    const bySize = Object.fromEntries(
      await Promise.all(
        entries.map(async (entry) => [entry.name, (await entry.getFile()).size] as const),
      ),
    );

    expect(bySize).toEqual({ "a.jpg": 3, "b.jpg": 4 });
  });

  it("returns nothing for an empty folder", async () => {
    expect(await new FsaAdapter(dir).list()).toEqual([]);
  });
});

describe("listAllNames", () => {
  it("includes non-images, which the rename planner needs", async () => {
    await write("beach.jpg");
    await write("notes.txt");

    expect((await new FsaAdapter(dir).listAllNames()).sort()).toEqual(["beach.jpg", "notes.txt"]);
  });
});

describe("delete", () => {
  it("removes the file", async () => {
    await write("a.jpg");
    await write("b.jpg");

    await new FsaAdapter(dir).delete("a.jpg");

    expect(await names()).toEqual(["b.jpg"]);
  });

  it("reports which file could not be deleted", async () => {
    await expect(new FsaAdapter(dir).delete("ghost.jpg")).rejects.toMatchObject({
      fileName: "ghost.jpg",
    });
  });
});

describe("rename", () => {
  it("renames the file and keeps its bytes", async () => {
    await write("a.jpg", Uint8Array.from([9, 9, 9]));

    await new FsaAdapter(dir).rename("a.jpg", "b.jpg");

    expect(await names()).toEqual(["b.jpg"]);
    const file = await (await dir.getFileHandle("b.jpg")).getFile();
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(Uint8Array.from([9, 9, 9]));
  });

  it("does nothing when the name is unchanged", async () => {
    await write("a.jpg");

    await new FsaAdapter(dir).rename("a.jpg", "a.jpg");

    expect(await names()).toEqual(["a.jpg"]);
  });

  it("reports which file could not be renamed", async () => {
    await expect(new FsaAdapter(dir).rename("ghost.jpg", "x.jpg")).rejects.toMatchObject({
      fileName: "ghost.jpg",
    });
  });
});

describe("rename via the copy-then-delete fallback", () => {
  // `move()` works here because OPFS supports it, but for a folder chosen with
  // showDirectoryPicker() it is flag-gated — so in production this fallback is
  // the path essentially every rename takes. It needs its own coverage.
  const fallback = () => new FsaAdapter(dir, { allowMove: false });

  it("renames the file and keeps its bytes", async () => {
    await write("a.jpg", Uint8Array.from([1, 2, 3, 4]));

    await fallback().rename("a.jpg", "b.jpg");

    expect(await names()).toEqual(["b.jpg"]);
    const file = await (await dir.getFileHandle("b.jpg")).getFile();
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("overwrites an existing target, as the underlying API does", async () => {
    await write("a.jpg", Uint8Array.from([1]));
    await write("b.jpg", Uint8Array.from([2]));

    await fallback().rename("a.jpg", "b.jpg");

    expect(await names()).toEqual(["b.jpg"]);
    const file = await (await dir.getFileHandle("b.jpg")).getFile();
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(Uint8Array.from([1]));
  });

  it("leaves the original untouched when the source cannot be read", async () => {
    await write("keep.jpg");

    await expect(fallback().rename("ghost.jpg", "x.jpg")).rejects.toMatchObject({
      fileName: "ghost.jpg",
    });
    expect(await names()).toEqual(["keep.jpg"]);
  });
});
