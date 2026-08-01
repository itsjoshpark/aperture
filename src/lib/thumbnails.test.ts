import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MemoryAdapter } from "./fs/memory-adapter";
import type { ImageEntry } from "./fs/types";
import { ThumbnailCache } from "./thumbnails";

// Node has no object URLs; the cache only ever hands the strings back out, so a
// counter stands in perfectly well and lets us assert on revocation.
let nextUrl = 0;
const revoked: string[] = [];

beforeEach(() => {
  nextUrl = 0;
  revoked.length = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => `blob:${nextUrl++}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

async function entriesOf(count: number): Promise<ImageEntry[]> {
  const fs = new MemoryAdapter(Array.from({ length: count }, (_, i) => `f${i}.jpg`));
  return fs.list();
}

describe("ThumbnailCache", () => {
  it("hands out a URL per file", async () => {
    const [a, b] = await entriesOf(2);
    const cache = new ThumbnailCache();

    expect(await cache.acquire(a!)).toBe("blob:0");
    expect(await cache.acquire(b!)).toBe("blob:1");
  });

  it("reuses the URL for a file it already holds", async () => {
    const [a] = await entriesOf(1);
    const cache = new ThumbnailCache();

    expect(await cache.acquire(a!)).toBe("blob:0");
    expect(await cache.acquire(a!)).toBe("blob:0");
    expect(cache.size).toBe(1);
  });

  it("shares a single read between concurrent callers", async () => {
    const [a] = await entriesOf(1);
    const getFile = vi.fn(() => a!.getFile());
    const cache = new ThumbnailCache();

    const urls = await Promise.all([
      cache.acquire({ ...a!, getFile }),
      cache.acquire({ ...a!, getFile }),
      cache.acquire({ ...a!, getFile }),
    ]);

    expect(new Set(urls).size).toBe(1);
    expect(getFile).toHaveBeenCalledTimes(1);
  });

  it("keeps everything while it is still in use", async () => {
    const entries = await entriesOf(5);
    const cache = new ThumbnailCache({ capacity: 2 });

    for (const entry of entries) await cache.acquire(entry);

    expect(cache.size).toBe(5);
    expect(revoked).toEqual([]);
  });

  it("evicts released entries beyond the cap, oldest first", async () => {
    const entries = await entriesOf(5);
    const cache = new ThumbnailCache({ capacity: 2 });

    for (const entry of entries) await cache.acquire(entry);
    for (const entry of entries) cache.release(entry.name);

    expect(cache.size).toBe(2);
    expect(revoked).toEqual(["blob:0", "blob:1", "blob:2"]);
  });

  it("never revokes a URL an acquired tile is still showing", async () => {
    const entries = await entriesOf(5);
    const cache = new ThumbnailCache({ capacity: 1 });

    for (const entry of entries) await cache.acquire(entry);
    // Everything except the first is released, so only the first must survive.
    for (const entry of entries.slice(1)) cache.release(entry.name);

    expect(revoked).not.toContain("blob:0");
  });

  it("promotes a re-acquired entry out of the eviction queue", async () => {
    const [a, b, c] = await entriesOf(3);
    const cache = new ThumbnailCache({ capacity: 2 });

    await cache.acquire(a!);
    await cache.acquire(b!);
    cache.release(a!.name); // still under the cap, so it stays cached
    await cache.acquire(a!); // scrolled back to it before it was evicted
    cache.release(b!.name);

    await cache.acquire(c!);
    cache.release(c!.name);

    // Without promotion, `a` would have been the oldest idle entry and gone first.
    expect(revoked).toEqual(["blob:1"]);
  });

  it("revokes everything on clear", async () => {
    const entries = await entriesOf(3);
    const cache = new ThumbnailCache();

    for (const entry of entries) await cache.acquire(entry);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(revoked).toEqual(["blob:0", "blob:1", "blob:2"]);
  });

  it("drops a single file on invalidate", async () => {
    const entries = await entriesOf(2);
    const cache = new ThumbnailCache();

    for (const entry of entries) await cache.acquire(entry);
    cache.invalidate(entries[0]!.name);

    expect(cache.size).toBe(1);
    expect(revoked).toEqual(["blob:0"]);
  });

  it("re-reads a file after it has been invalidated", async () => {
    const [a] = await entriesOf(1);
    const cache = new ThumbnailCache();

    await cache.acquire(a!);
    cache.invalidate(a!.name);

    expect(await cache.acquire(a!)).toBe("blob:1");
  });

  /**
   * HEIC previews are decoded JPEGs held in memory rather than handles onto a
   * file, so the count cap alone would let a folder of iPhone photos hold a few
   * hundred megabytes. Anything reporting bytes is capped by them too.
   */
  describe("decoded previews", () => {
    const sized = (bytes: number) => async (entry: ImageEntry) => ({
      url: URL.createObjectURL(await entry.getFile()),
      bytes,
    });

    it("evicts released entries over the byte budget even when under the count cap", async () => {
      const entries = await entriesOf(5);
      const cache = new ThumbnailCache({ render: sized(100), capacity: 300, byteBudget: 250 });

      for (const entry of entries) await cache.acquire(entry);
      expect(cache.bytes).toBe(500);

      for (const entry of entries) cache.release(entry.name);

      expect(cache.size).toBe(2);
      expect(cache.bytes).toBe(200);
      expect(revoked).toEqual(["blob:0", "blob:1", "blob:2"]);
    });

    it("gives the bytes back on invalidate and clear", async () => {
      const entries = await entriesOf(2);
      const cache = new ThumbnailCache({ render: sized(100) });

      for (const entry of entries) await cache.acquire(entry);
      cache.invalidate(entries[0]!.name);
      expect(cache.bytes).toBe(100);

      cache.clear();
      expect(cache.bytes).toBe(0);
    });

    it("does not budget pass-through URLs, which point at the file rather than copy it", async () => {
      const entries = await entriesOf(5);
      const cache = new ThumbnailCache({ byteBudget: 0 });

      for (const entry of entries) await cache.acquire(entry);
      for (const entry of entries) cache.release(entry.name);

      expect(cache.size).toBe(5);
      expect(revoked).toEqual([]);
    });
  });

  /**
   * Decoding can fail on a corrupt file, and it is slow enough that a tile
   * routinely scrolls away mid-flight. Neither may leave the cache wedged.
   */
  describe("renders that do not finish", () => {
    it("rejects every waiter and lets the next acquire try again", async () => {
      const [a] = await entriesOf(1);
      const render = vi
        .fn()
        .mockRejectedValueOnce(new Error("not a HEIC image"))
        .mockImplementation(async (entry: ImageEntry) => ({
          url: URL.createObjectURL(await entry.getFile()),
          bytes: 0,
        }));
      const cache = new ThumbnailCache({ render });

      const both = Promise.allSettled([cache.acquire(a!), cache.acquire(a!)]);
      expect((await both).map((result) => result.status)).toEqual(["rejected", "rejected"]);

      // A failed render must not poison the name — the file may simply have been
      // busy, and a rename brings the tile straight back.
      cache.release(a!.name);
      expect(await cache.acquire(a!)).toBe("blob:0");
      expect(render).toHaveBeenCalledTimes(2);
    });

    it("aborts a render nothing is waiting for any more", async () => {
      const [a] = await entriesOf(1);
      let signal!: AbortSignal;
      const render = (_entry: ImageEntry, incoming: AbortSignal) => {
        signal = incoming;
        return new Promise<{ url: string; bytes: number }>((_, reject) => {
          incoming.addEventListener("abort", () => reject(new Error("cancelled")));
        });
      };
      const cache = new ThumbnailCache({ render });

      const pending = cache.acquire(a!);
      expect(signal.aborted).toBe(false);

      cache.release(a!.name);

      expect(signal.aborted).toBe(true);
      await expect(pending).rejects.toThrow("cancelled");
    });

    it("keeps rendering while another caller still wants it", async () => {
      const [a] = await entriesOf(1);
      let signal!: AbortSignal;
      const cache = new ThumbnailCache({
        render: async (entry: ImageEntry, incoming: AbortSignal) => {
          signal = incoming;
          return { url: URL.createObjectURL(await entry.getFile()), bytes: 0 };
        },
      });

      const first = cache.acquire(a!);
      const second = cache.acquire(a!);
      cache.release(a!.name);

      expect(signal.aborted).toBe(false);
      expect(await first).toBe("blob:0");
      expect(await second).toBe("blob:0");
    });
  });
});
