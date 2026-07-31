import { describe, expect, it } from "vite-plus/test";
import { MemoryAdapter } from "./memory-adapter";
import { FileOperationError } from "./types";

describe("MemoryAdapter", () => {
  it("lists only images, but reports every name", async () => {
    const fs = new MemoryAdapter(["a.jpg", "notes.txt", "b.png", ".DS_Store"]);

    expect((await fs.list()).map((entry) => entry.name)).toEqual(["a.jpg", "b.png"]);
    expect(await fs.listAllNames()).toEqual(["a.jpg", "notes.txt", "b.png", ".DS_Store"]);
  });

  it("splits base and extension on listed entries", async () => {
    const fs = new MemoryAdapter(["IMG_0042.jpg"]);
    const [entry] = await fs.list();

    expect(entry).toMatchObject({ name: "IMG_0042.jpg", base: "IMG_0042", ext: ".jpg" });
  });

  it("gives each file a distinct ascending timestamp", async () => {
    const entries = await new MemoryAdapter(["a.jpg", "b.jpg", "c.jpg"]).list();
    const times = entries.map((entry) => entry.lastModified);

    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(3);
  });

  it("returns file contents", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fs = new MemoryAdapter([{ name: "a.jpg", bytes }]);
    const [entry] = await fs.list();

    expect(new Uint8Array(await (await entry.getFile()).arrayBuffer())).toEqual(bytes);
  });

  it("deletes a file", async () => {
    const fs = new MemoryAdapter(["a.jpg", "b.jpg"]);
    await fs.delete("a.jpg");

    expect(fs.names()).toEqual(["b.jpg"]);
  });

  it("rejects deleting a file that is not there", async () => {
    const fs = new MemoryAdapter(["a.jpg"]);

    await expect(fs.delete("ghost.jpg")).rejects.toThrow(FileOperationError);
  });

  it("renames a file, preserving its bytes", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const fs = new MemoryAdapter([{ name: "a.jpg", bytes }]);
    await fs.rename("a.jpg", "b.jpg");

    expect(fs.names()).toEqual(["b.jpg"]);
    expect(fs.snapshot()["b.jpg"]).toEqual(bytes);
  });

  it("overwrites the target, matching the real API", async () => {
    const fs = new MemoryAdapter([
      { name: "a.jpg", bytes: new Uint8Array([1]) },
      { name: "b.jpg", bytes: new Uint8Array([2]) },
    ]);
    await fs.rename("a.jpg", "b.jpg");

    expect(fs.names()).toEqual(["b.jpg"]);
    expect(fs.snapshot()["b.jpg"]).toEqual(new Uint8Array([1]));
  });

  it("treats renaming to the same name as a no-op", async () => {
    const fs = new MemoryAdapter(["a.jpg"]);
    await fs.rename("a.jpg", "a.jpg");

    expect(fs.names()).toEqual(["a.jpg"]);
    expect(fs.renameLog).toEqual([]);
  });

  it("can be told to fail a specific rename", async () => {
    const fs = new MemoryAdapter(["a.jpg", "b.jpg"], {
      beforeRename: (from) => {
        if (from === "b.jpg") throw new Error("disk on fire");
      },
    });

    await fs.rename("a.jpg", "1.jpg");
    await expect(fs.rename("b.jpg", "2.jpg")).rejects.toThrow("disk on fire");
    expect(fs.names()).toEqual(["b.jpg", "1.jpg"]);
  });

  it("blocks writes until permission is granted", async () => {
    const fs = new MemoryAdapter(["a.jpg"], { permission: false });

    await expect(fs.delete("a.jpg")).rejects.toThrow("Permission denied");
    await expect(fs.ensurePermission()).resolves.toBe(true);
    await expect(fs.delete("a.jpg")).resolves.toBeUndefined();
  });
});
