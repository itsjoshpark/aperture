import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { effectScope } from "vue";
import type { FolderSource } from "@/lib/fs/folder-source";
import { MemoryAdapter } from "@/lib/fs/memory-adapter";
import { createAperture, type Aperture } from "./useAperture";
import { useKeyboard } from "./useKeyboard";

/**
 * The key map, driven through real `keydown` events on real elements.
 *
 * A browser test for two reasons: `useKeyboard` binds to `window`, and half of
 * what it decides is about where a key came from — a text field, a slider thumb
 * — which means the event needs a genuine target to have travelled from.
 */

const scopes: ReturnType<typeof effectScope>[] = [];
const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  for (const element of mounted.splice(0)) element.remove();
});

interface Bound {
  aperture: Aperture;
  opened: ReturnType<typeof vi.fn>;
  press: (key: string, init?: KeyboardEventInit, target?: EventTarget) => KeyboardEvent;
}

/** Wires the key map to an Aperture, optionally with a folder already open. */
async function bind(options: { folder?: string[] } = {}): Promise<Bound> {
  const adapter = new MemoryAdapter(options.folder ?? ["a.jpg", "b.jpg", "c.jpg"], {
    label: "Test Folder",
  });
  const opened = vi.fn(async () => adapter);
  const source: FolderSource = { open: opened };

  const scope = effectScope();
  scopes.push(scope);
  const aperture = scope.run(() => {
    const instance = createAperture({ source, supported: true });
    useKeyboard(instance);
    return instance;
  })!;

  if (options.folder !== undefined) {
    await aperture.openFolder();
    opened.mockClear();
  }

  return {
    aperture,
    opened,
    press: (key, init = {}, target = window) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    },
  };
}

/** An element in the document, so a key dispatched on it really bubbles to window. */
function element(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  document.body.append(node);
  mounted.push(node);
  return node;
}

describe("Cmd/Ctrl+O", () => {
  test("opens a folder before there is one to browse", async () => {
    const { opened, press } = await bind();

    press("o", { metaKey: true });

    expect(opened).toHaveBeenCalledOnce();
  });

  test("still opens one from inside the gallery", async () => {
    const { opened, press } = await bind({ folder: ["a.jpg"] });

    press("o", { ctrlKey: true });

    expect(opened).toHaveBeenCalledOnce();
  });

  test("claims the key from Chrome even when it declines to act", async () => {
    // Preventing default before the bail-outs is what stops a modal leaking the
    // chord through to the browser's own Open dialog.
    const { aperture, opened, press } = await bind({ folder: ["a.jpg"] });
    aperture.deleteDialogOpen.value = true;

    const event = press("o", { metaKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(opened).not.toHaveBeenCalled();
  });

  test("does nothing while a rename is being written to disk", async () => {
    const { aperture, opened, press } = await bind({ folder: ["a.jpg"] });
    aperture.rename.applying.value = true;

    press("o", { metaKey: true });

    expect(opened).not.toHaveBeenCalled();
  });

  test("a held key does not queue a second picker", async () => {
    const { opened, press } = await bind();

    press("o", { metaKey: true, repeat: true });

    expect(opened).not.toHaveBeenCalled();
  });

  test("leaves Shift and Alt variants to whatever else has them bound", async () => {
    const { opened, press } = await bind();

    press("o", { metaKey: true, shiftKey: true });
    press("o", { metaKey: true, altKey: true });

    expect(opened).not.toHaveBeenCalled();
  });

  test("works from inside a text field, where the arrows do not", async () => {
    const { opened, press } = await bind({ folder: ["a.jpg"] });

    press("o", { metaKey: true }, element("input"));

    expect(opened).toHaveBeenCalledOnce();
  });
});

describe("keys aimed at something else", () => {
  test("a text field keeps its own arrows", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");

    press("ArrowRight", {}, element("input"));

    expect(aperture.gallery.cursorName.value).toBe("a.jpg");
  });

  test("a focused slider keeps its own arrows, or one press would do two things", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");

    press("ArrowRight", {}, element("span", { role: "slider" }));

    expect(aperture.gallery.cursorName.value).toBe("a.jpg");
  });

  test("an open dialog swallows the rest of the map", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");
    aperture.deleteDialogOpen.value = true;

    press("ArrowRight");

    expect(aperture.gallery.cursorName.value).toBe("a.jpg");
  });

  test("nothing but the open chord fires without a folder", async () => {
    const { aperture, press } = await bind();

    const event = press("ArrowRight");

    expect(event.defaultPrevented).toBe(false);
    expect(aperture.gallery.cursorName.value).toBeNull();
  });
});

describe("Escape unwinds one layer at a time", () => {
  test("leaves the large view before it touches rename mode", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");
    aperture.enterRename();
    aperture.openLargeView();

    press("Escape");

    expect(aperture.gallery.view.value).toBe("grid");
    expect(aperture.rename.active.value).toBe(true);
  });

  test("leaves rename mode before it clears the selection", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");
    aperture.enterRename();

    press("Escape");

    expect(aperture.rename.active.value).toBe(false);
    expect(aperture.gallery.cursorName.value).toBe("a.jpg");
  });

  test("clears the selection only once there is nothing left to leave", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");

    press("Escape");

    expect(aperture.gallery.cursorName.value).toBeNull();
  });
});

describe("navigation", () => {
  test("moves the selection and claims the key", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg", "c.jpg"] });
    aperture.gallery.select("a.jpg");

    const event = press("ArrowRight");

    expect(aperture.gallery.cursorName.value).toBe("b.jpg");
    expect(event.defaultPrevented).toBe(true);
  });

  test("Shift extends the selection instead of replacing it", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg", "c.jpg"] });
    aperture.gallery.select("a.jpg");

    press("ArrowRight", { shiftKey: true });

    expect([...aperture.gallery.selectedNames.value]).toEqual(["a.jpg", "b.jpg"]);
  });

  test("Cmd and an arrow reorders rather than navigating", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg", "c.jpg"] });
    aperture.gallery.select("a.jpg");

    press("ArrowRight", { metaKey: true });

    expect(aperture.rename.active.value).toBe(true);
    expect(aperture.displayed.value.map((entry) => entry.name)).toEqual([
      "b.jpg",
      "a.jpg",
      "c.jpg",
    ]);
  });

  test("vertical movement means nothing on a single image", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg", "c.jpg"] });
    aperture.gallery.select("a.jpg");
    aperture.openLargeView();

    const event = press("ArrowDown");

    expect(aperture.gallery.cursorName.value).toBe("a.jpg");
    expect(event.defaultPrevented).toBe(false);
  });

  test("an unmapped key is left alone", async () => {
    const { press } = await bind({ folder: ["a.jpg"] });

    expect(press("q").defaultPrevented).toBe(false);
  });
});

describe("Space and Delete", () => {
  test("Space opens the large view and closes it again", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");

    press(" ");
    expect(aperture.gallery.view.value).toBe("large");

    press(" ");
    expect(aperture.gallery.view.value).toBe("grid");
  });

  test("Delete asks first", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("a.jpg");

    press("Delete");

    expect(aperture.deleteDialogOpen.value).toBe(true);
    expect(aperture.pendingDeletes.value.map((entry) => entry.name)).toEqual(["a.jpg"]);
  });

  test("Backspace is the same key", async () => {
    const { aperture, press } = await bind({ folder: ["a.jpg", "b.jpg"] });
    aperture.gallery.select("b.jpg");

    press("Backspace");

    expect(aperture.pendingDeletes.value.map((entry) => entry.name)).toEqual(["b.jpg"]);
  });
});
