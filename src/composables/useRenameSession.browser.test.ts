import { expect, test } from "vite-plus/test";
import { MemoryAdapter } from "@/lib/fs/memory-adapter";
import { useGallery } from "./useGallery";
import { useRenameSession } from "./useRenameSession";

/**
 * The collision check is only as good as the list of names it is checked
 * against, and a session outlives changes to the folder: deletes go through the
 * open bar, and Finder is still there. A list captured once and never refreshed
 * refuses a rename over a file that is no longer on disk — and the bar offers no
 * way out of that, because the only thing that re-reads the folder is starting
 * the session again.
 *
 * These run in the browser project because `useGallery` reads `localStorage`.
 */

async function openSession(names: string[]) {
  const port = new MemoryAdapter(names);
  const gallery = useGallery();
  const rename = useRenameSession(gallery);

  await gallery.open(port);
  rename.begin(gallery.sorted.value);

  return { port, gallery, rename };
}

function setOptions(
  rename: ReturnType<typeof useRenameSession>,
  patch: Partial<(typeof rename.options)["value"]>,
): void {
  rename.options.value = { ...rename.options.value, ...patch };
}

test("forgets a file deleted while the session is open", async () => {
  const { gallery, rename } = await openSession([
    "Photo 01.heic",
    "Photo 02.heic",
    "Photo 03.heic",
  ]);

  // Exactly what `confirmDelete` does once the tile has animated out.
  await gallery.removeMany(["Photo 02.heic"], rename.draft.value);
  rename.forget("Photo 02.heic");

  // Two files left, so the second one is headed for the name the deleted file
  // used to hold. Nothing is in the way of that any more — and the space in the
  // prefix is legal, whatever the character class in `naming.ts` looks like.
  setOptions(rename, { prefix: "Photo ", padding: 2 });

  expect(rename.plan.value.problems).toEqual([]);
  expect(rename.plan.value.valid).toBe(true);
});

test("flags a colliding file that appears after the session started", async () => {
  const { port, gallery, rename } = await openSession(["a.jpg", "b.jpg", "notes.txt"]);

  setOptions(rename, { prefix: "shot-" });
  expect(rename.plan.value.valid).toBe(true);

  // Something outside Aperture puts a file on one of the targets.
  await port.rename("notes.txt", "shot-2.jpg");
  await gallery.refresh();

  expect(rename.plan.value.valid).toBe(false);
  expect(rename.plan.value.problems[0]?.code).toBe("external-collision");
  expect(rename.plan.value.problems[0]?.names).toEqual(["shot-2.jpg"]);
});
