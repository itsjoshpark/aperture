import { afterEach, describe, expect, test } from "vite-plus/test";
import { effectScope } from "vue";
import type { FolderSource } from "@/lib/fs/folder-source";
import { MemoryAdapter } from "@/lib/fs/memory-adapter";
import { createAperture, type Aperture } from "./useAperture";

/**
 * In the browser project rather than `unit` because `createAperture` cannot be
 * built under node at all: `useUnsavedGuard` hands `window` straight to
 * `useEventListener`, so constructing one is a `ReferenceError` before any of
 * this has a chance to run.
 *
 * What is worth pinning here is `nudgeSelection` — the arrow-key half of moving
 * a selection, which does index arithmetic that the drag reaches by a different
 * route and no unit test covers.
 */

const scopes: ReturnType<typeof effectScope>[] = [];

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
});

async function open(names: string[]): Promise<Aperture> {
  const adapter = new MemoryAdapter(names, { label: "Test Folder" });
  const source: FolderSource = { open: async () => adapter };

  const scope = effectScope();
  scopes.push(scope);
  const aperture = scope.run(() => createAperture({ source, supported: true }))!;

  await aperture.openFolder();
  return aperture;
}

/** The order the grid is showing, which is the draft once rename mode is on. */
const order = (aperture: Aperture) => aperture.displayed.value.map((entry) => entry.name);

describe("nudgeSelection", () => {
  test("moves a single photo along by one", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    aperture.gallery.select("a.jpg");

    aperture.nudgeSelection(1);

    expect(order(aperture)).toEqual(["b.jpg", "a.jpg", "c.jpg", "d.jpg"]);
  });

  test("entering rename mode is what the first nudge does", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg"]);
    aperture.gallery.select("a.jpg");
    expect(aperture.rename.active.value).toBe(false);

    aperture.nudgeSelection(1);

    expect(aperture.rename.active.value).toBe(true);
  });

  test("a contiguous run already at the end does not move", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    aperture.gallery.select("a.jpg");

    aperture.nudgeSelection(-1);

    expect(order(aperture)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  test("a run cannot be nudged past the end of the list", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    aperture.gallery.select("c.jpg");
    aperture.gallery.extendTo("d.jpg", aperture.displayed.value);

    aperture.nudgeSelection(1);

    expect(order(aperture)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  test("moves a contiguous selection as one block", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    aperture.gallery.select("a.jpg");
    aperture.gallery.extendTo("b.jpg", aperture.displayed.value);

    aperture.nudgeSelection(1);

    expect(order(aperture)).toEqual(["c.jpg", "a.jpg", "b.jpg", "d.jpg"]);
  });

  test("gathers a scattered selection instead of dealing it out one at a time", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    aperture.gallery.select("a.jpg");
    aperture.gallery.toggle("c.jpg", aperture.displayed.value);

    aperture.nudgeSelection(1);

    // Collected into one block at the cursor — `c.jpg`, the photo the arrows
    // have been moving — rather than each member shuffling along independently.
    expect(order(aperture)).toEqual(["b.jpg", "d.jpg", "a.jpg", "c.jpg"]);
  });

  test("a gathered run keeps grid order, not the order it was selected in", async () => {
    const aperture = await open(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"]);
    // `d.jpg` is picked first, but `b.jpg` is what the run leads with — and,
    // being the newer click, is also where the cursor now is.
    aperture.gallery.select("d.jpg");
    aperture.gallery.toggle("b.jpg", aperture.displayed.value);

    aperture.nudgeSelection(-1);

    expect(order(aperture)).toEqual(["b.jpg", "d.jpg", "a.jpg", "c.jpg", "e.jpg"]);
  });
});

describe("delete confirmation", () => {
  test("holds what the dialog is about apart from whether it is open", async () => {
    const aperture = await open(["a.jpg", "b.jpg"]);
    aperture.gallery.select("a.jpg");

    aperture.askToDelete();

    expect(aperture.deleteDialogOpen.value).toBe(true);
    expect(aperture.pendingDeletes.value.map((entry) => entry.name)).toEqual(["a.jpg"]);
  });

  test("asking with nothing selected opens nothing", async () => {
    const aperture = await open(["a.jpg", "b.jpg"]);

    aperture.askToDelete();

    expect(aperture.deleteDialogOpen.value).toBe(false);
  });

  test("reports a delete the disk refused, naming the file that stayed", async () => {
    const adapter = new MemoryAdapter(["a.jpg", "b.jpg"], {
      beforeDelete: (name) => {
        if (name === "a.jpg") throw new Error("Permission denied");
      },
    });
    const scope = effectScope();
    scopes.push(scope);
    const aperture = scope.run(() =>
      createAperture({ source: { open: async () => adapter }, supported: true }),
    )!;
    await aperture.openFolder();

    aperture.gallery.select("a.jpg");
    aperture.askToDelete();
    await aperture.confirmDelete();

    expect(aperture.gallery.error.value).toContain("a.jpg");
    expect(aperture.gallery.error.value).toContain("Permission denied");
    expect(adapter.names()).toEqual(["a.jpg", "b.jpg"]);
  });

  test("names only what survived when part of a selection went", async () => {
    const adapter = new MemoryAdapter(["a.jpg", "b.jpg", "c.jpg"], {
      beforeDelete: (name) => {
        if (name === "a.jpg") throw new Error("Permission denied");
      },
    });
    const scope = effectScope();
    scopes.push(scope);
    const aperture = scope.run(() =>
      createAperture({ source: { open: async () => adapter }, supported: true }),
    )!;
    await aperture.openFolder();

    aperture.gallery.select("a.jpg");
    aperture.gallery.extendTo("b.jpg", aperture.displayed.value);
    aperture.askToDelete();
    await aperture.confirmDelete();

    expect(aperture.gallery.error.value).toContain("a.jpg");
    expect(aperture.gallery.error.value).not.toContain("b.jpg");
    expect(adapter.names()).toEqual(["a.jpg", "c.jpg"]);
  });
});
