import { describe, expect, it, vi } from "vite-plus/test";
import { MemoryAdapter } from "./fs/memory-adapter";
import type { ImageEntry } from "./fs/types";
import { buildRenamePlan, DEFAULT_RENAME_OPTIONS, type RenameOptions } from "./naming";
import { buildUndoSteps, executeRename, findLeftoverTempNames, TEMP_PREFIX } from "./rename-engine";

async function ordered(fs: MemoryAdapter, names: string[]): Promise<ImageEntry[]> {
  const listed = await fs.list();
  return names.map((name) => listed.find((entry) => entry.name === name)!);
}

async function planFor(fs: MemoryAdapter, order: string[], options: Partial<RenameOptions> = {}) {
  return buildRenamePlan(
    await ordered(fs, order),
    { ...DEFAULT_RENAME_OPTIONS, ...options },
    await fs.listAllNames(),
  );
}

describe("executeRename", () => {
  it("renames files to their targets", async () => {
    const fs = new MemoryAdapter(["c.jpg", "a.jpg", "b.jpg"]);
    const plan = await planFor(fs, ["a.jpg", "b.jpg", "c.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.names().sort()).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
    expect(fs.snapshot()["1.jpg"]).toBeDefined();
  });

  it("survives a straight swap", async () => {
    // The case a naive in-order rename destroys: each target is held by the other
    // file at the moment we want it.
    const fs = new MemoryAdapter([
      { name: "1.jpg", bytes: new Uint8Array([1]) },
      { name: "2.jpg", bytes: new Uint8Array([2]) },
    ]);
    const plan = await planFor(fs, ["2.jpg", "1.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.snapshot()["1.jpg"]).toEqual(new Uint8Array([2]));
    expect(fs.snapshot()["2.jpg"]).toEqual(new Uint8Array([1]));
  });

  it("survives a full reversal", async () => {
    const bytes = (n: number) => new Uint8Array([n]);
    const fs = new MemoryAdapter([
      { name: "1.jpg", bytes: bytes(1) },
      { name: "2.jpg", bytes: bytes(2) },
      { name: "3.jpg", bytes: bytes(3) },
      { name: "4.jpg", bytes: bytes(4) },
    ]);
    const plan = await planFor(fs, ["4.jpg", "3.jpg", "2.jpg", "1.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.snapshot()["1.jpg"]).toEqual(bytes(4));
    expect(fs.snapshot()["2.jpg"]).toEqual(bytes(3));
    expect(fs.snapshot()["3.jpg"]).toEqual(bytes(2));
    expect(fs.snapshot()["4.jpg"]).toEqual(bytes(1));
  });

  it("survives a rotation by one", async () => {
    const bytes = (n: number) => new Uint8Array([n]);
    const fs = new MemoryAdapter([
      { name: "1.jpg", bytes: bytes(1) },
      { name: "2.jpg", bytes: bytes(2) },
      { name: "3.jpg", bytes: bytes(3) },
    ]);
    const plan = await planFor(fs, ["3.jpg", "1.jpg", "2.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.snapshot()["1.jpg"]).toEqual(bytes(3));
    expect(fs.snapshot()["2.jpg"]).toEqual(bytes(1));
    expect(fs.snapshot()["3.jpg"]).toEqual(bytes(2));
  });

  it("leaves files that already have the right name completely alone", async () => {
    const fs = new MemoryAdapter(["1.jpg", "b.jpg"]);
    const plan = await planFor(fs, ["1.jpg", "b.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.renameLog.every((entry) => entry.from !== "1.jpg")).toBe(true);
    expect(fs.names().sort()).toEqual(["1.jpg", "2.jpg"]);
  });

  it("routes every rename through a temp name", async () => {
    const fs = new MemoryAdapter(["b.jpg", "a.jpg"]);
    const plan = await planFor(fs, ["a.jpg", "b.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.renameLog).toHaveLength(4);
    expect(fs.renameLog.slice(0, 2).every((entry) => entry.to.startsWith(TEMP_PREFIX))).toBe(true);
    expect(fs.renameLog.slice(2).every((entry) => entry.from.startsWith(TEMP_PREFIX))).toBe(true);
  });

  it("leaves no temp files behind", async () => {
    const fs = new MemoryAdapter(["b.jpg", "a.jpg", "c.jpg"]);
    const plan = await planFor(fs, ["c.jpg", "b.jpg", "a.jpg"]);

    await executeRename(fs, plan.changes);

    expect(fs.names().some((name) => name.startsWith(TEMP_PREFIX))).toBe(false);
  });

  it("returns the records needed to undo", async () => {
    const fs = new MemoryAdapter(["b.jpg", "a.jpg"]);
    const plan = await planFor(fs, ["a.jpg", "b.jpg"]);

    const records = await executeRename(fs, plan.changes);

    expect(records).toEqual([
      { from: "a.jpg", to: "1.jpg" },
      { from: "b.jpg", to: "2.jpg" },
    ]);
  });

  it("reports progress across both phases", async () => {
    const fs = new MemoryAdapter(["b.jpg", "a.jpg"]);
    const plan = await planFor(fs, ["a.jpg", "b.jpg"]);
    const onProgress = vi.fn();

    await executeRename(fs, plan.changes, { onProgress });

    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.lastCall![0];
    expect(last.completed).toBe(last.total);
    expect(last.total).toBe(4);
  });

  describe("when a rename fails partway", () => {
    it("rolls the folder back to exactly how it started", async () => {
      const names = ["a.jpg", "b.jpg", "c.jpg"];
      const fs = new MemoryAdapter(names, {
        beforeRename: (_from, to) => {
          // Fail during phase B, after phase A has already moved everything.
          if (to === "2.jpg") throw new Error("disk on fire");
        },
      });
      const plan = await planFor(fs, ["c.jpg", "b.jpg", "a.jpg"]);

      await expect(executeRename(fs, plan.changes)).rejects.toThrow("disk on fire");

      expect(fs.names().sort()).toEqual(names);
      expect(fs.names().some((name) => name.startsWith(TEMP_PREFIX))).toBe(false);
    });

    it("rolls back a failure during the first phase", async () => {
      const names = ["a.jpg", "b.jpg", "c.jpg"];
      const fs = new MemoryAdapter(names, {
        beforeRename: (from) => {
          if (from === "c.jpg") throw new Error("nope");
        },
      });
      const plan = await planFor(fs, ["c.jpg", "b.jpg", "a.jpg"]);

      await expect(executeRename(fs, plan.changes)).rejects.toThrow("nope");

      expect(fs.names().sort()).toEqual(names);
    });

    it("reports the file that failed", async () => {
      const fs = new MemoryAdapter(["a.jpg", "b.jpg"], {
        beforeRename: (from) => {
          if (from === "b.jpg") throw new Error("nope");
        },
      });
      const plan = await planFor(fs, ["b.jpg", "a.jpg"]);

      await expect(executeRename(fs, plan.changes)).rejects.toMatchObject({
        fileName: "b.jpg",
      });
    });
  });

  it("aborts and rolls back when signalled", async () => {
    const names = ["a.jpg", "b.jpg", "c.jpg"];
    const controller = new AbortController();
    const fs = new MemoryAdapter(names, {
      beforeRename: (from) => {
        if (from === "b.jpg") controller.abort();
      },
    });
    const plan = await planFor(fs, ["c.jpg", "b.jpg", "a.jpg"]);

    await expect(executeRename(fs, plan.changes, { signal: controller.signal })).rejects.toThrow(
      /cancelled/i,
    );
    expect(fs.names().sort()).toEqual(names);
  });
});

describe("buildUndoSteps", () => {
  it("restores every original name", async () => {
    const fs = new MemoryAdapter(["b.jpg", "a.jpg", "c.jpg"]);
    const before = fs.snapshot();
    const plan = await planFor(fs, ["c.jpg", "a.jpg", "b.jpg"], { prefix: "trip-" });

    const records = await executeRename(fs, plan.changes);
    expect(fs.names().sort()).toEqual(["trip-1.jpg", "trip-2.jpg", "trip-3.jpg"]);

    await executeRename(fs, buildUndoSteps(records));

    expect(fs.snapshot()).toEqual(before);
  });

  it("undoes a rename whose targets overlap the original names", async () => {
    const fs = new MemoryAdapter([
      { name: "1.jpg", bytes: new Uint8Array([1]) },
      { name: "2.jpg", bytes: new Uint8Array([2]) },
    ]);
    const before = fs.snapshot();
    const plan = await planFor(fs, ["2.jpg", "1.jpg"]);

    await executeRename(fs, buildUndoSteps(await executeRename(fs, plan.changes)));

    expect(fs.snapshot()).toEqual(before);
  });
});

describe("findLeftoverTempNames", () => {
  it("finds temp files from a crashed run", () => {
    expect(
      findLeftoverTempNames(["a.jpg", `${TEMP_PREFIX}abc-0.jpg`, `${TEMP_PREFIX}abc-1.png`]),
    ).toEqual([`${TEMP_PREFIX}abc-0.jpg`, `${TEMP_PREFIX}abc-1.png`]);
  });

  it("finds nothing in a clean folder", () => {
    expect(findLeftoverTempNames(["a.jpg", "b.jpg"])).toEqual([]);
  });
});
