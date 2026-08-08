import type { ImageEntry } from "./fs/types";
import { objectUrlPreview, type PreviewRenderer } from "./preview/renderer";

/**
 * Bounded cache of object URLs for image previews.
 *
 * A folder of 2,000 photos is several gigabytes; holding a decoded blob URL for
 * every one of them is not an option. Tiles acquire a URL when they scroll into
 * view and release it when they leave, and anything released beyond the cap is
 * revoked, oldest first.
 *
 * Only released entries are evictable, so a URL is never revoked out from under
 * a visible `<img>`.
 *
 * Two caps, because two kinds of preview live here. A URL pointing at a file on
 * disk is a handle and costs nothing, so those are limited only by count. A HEIC
 * preview is a JPEG we decoded and are holding in memory, so those are limited
 * by total bytes as well — a folder of iPhone photos would otherwise fill the
 * count cap with 300 × ~250 KB.
 *
 * Callers must pair every `acquire()` with exactly one `release()`, including
 * when the acquire rejects and including when they give up before it settles —
 * that is what lets an unwanted decode be cancelled rather than run to
 * completion for nobody.
 */

const DEFAULT_CAPACITY = 300;
const DEFAULT_BYTE_BUDGET = 64 * 1024 * 1024;

interface Slot {
  /** Identity that survives being read back through a reactive proxy. */
  id: number;
  /** Outstanding `acquire()` calls, whether or not they have settled yet. */
  refs: number;
  controller: AbortController;
  promise: Promise<string>;
  /** Set once the render finishes. Null while it is still running. */
  url: string | null;
  bytes: number;
}

export interface ThumbnailCacheOptions {
  render?: PreviewRenderer;
  capacity?: number;
  /** Ceiling on memory held by decoded previews. Ignored by pass-through URLs. */
  byteBudget?: number;
}

export class ThumbnailCache {
  private readonly slots = new Map<string, Slot>();
  /** Names of released slots, least recently used first. */
  private readonly idle: string[] = [];
  private readonly render: PreviewRenderer;
  private readonly capacity: number;
  private readonly byteBudget: number;
  private derived = 0;
  private nextId = 1;

  constructor(options: ThumbnailCacheOptions = {}) {
    this.render = options.render ?? objectUrlPreview;
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.byteBudget = options.byteBudget ?? DEFAULT_BYTE_BUDGET;
  }

  /** Number of live object URLs. Test affordance. */
  get size(): number {
    let count = 0;
    for (const slot of this.slots.values()) if (slot.url !== null) count += 1;
    return count;
  }

  /** Bytes held by decoded previews. Test affordance. */
  get bytes(): number {
    return this.derived;
  }

  async acquire(entry: ImageEntry): Promise<string> {
    // Two tiles can ask for the same file before the first render finishes —
    // share the work rather than decoding one photo twice.
    const slot = this.slots.get(entry.name) ?? this.start(entry);
    slot.refs += 1;
    this.forget(entry.name);
    return slot.promise;
  }

  release(name: string): void {
    const slot = this.slots.get(name);
    if (!slot) return;

    slot.refs -= 1;
    if (slot.refs > 0) return;

    // Nothing wants this any more. If it never finished, stop it; grid scrolling
    // queues far more decodes than it needs, and a stale one is 600 ms of CPU
    // spent ahead of the photos actually on screen.
    if (slot.url === null) {
      slot.controller.abort();
      return;
    }

    this.forget(name);
    this.idle.push(name);
    this.evict();
  }

  /**
   * Drop everything. Called on every re-listing, because names are the cache
   * keys and a rename is free to keep one and put another photo behind it —
   * `1.jpg` may now be a completely different photograph.
   */
  clear(): void {
    for (const slot of this.slots.values()) this.discard(slot);
    this.slots.clear();
    this.idle.length = 0;
    this.derived = 0;
  }

  /** Drop one file, e.g. after deleting it. */
  invalidate(name: string): void {
    const slot = this.slots.get(name);
    if (!slot) return;
    this.discard(slot);
    this.slots.delete(name);
    this.forget(name);
  }

  private start(entry: ImageEntry): Slot {
    const name = entry.name;
    const controller = new AbortController();
    const id = this.nextId++;

    const slot: Slot = { id, refs: 0, controller, url: null, bytes: 0, promise: null! };

    slot.promise = this.render(entry, controller.signal).then(
      (preview) => {
        // Invalidated or cleared while rendering, or dropped and started again:
        // the slot this URL belongs to is gone, so it would leak if we did not
        // revoke it here.
        //
        // Compared by id rather than by object identity, because the cache gets
        // handed to components as a prop and Vue will hand back a reactive proxy
        // of a slot rather than the slot itself. `proxy !== target` is always
        // true, which would fail every render.
        if (this.slots.get(name)?.id !== id) {
          URL.revokeObjectURL(preview.url);
          throw new Error(`Preview for ${name} was discarded while it was being prepared.`);
        }

        slot.url = preview.url;
        slot.bytes = preview.bytes;
        this.derived += preview.bytes;

        // Everyone who asked for it gave up before it was ready. Keep it — the
        // work is already done — but make it the first thing evicted.
        if (slot.refs === 0) {
          this.idle.push(name);
          this.evict();
        }
        return preview.url;
      },
      (cause: unknown) => {
        if (this.slots.get(name)?.id === id) this.slots.delete(name);
        throw cause;
      },
    );

    this.slots.set(name, slot);
    return slot;
  }

  private discard(slot: Slot): void {
    if (slot.url === null) {
      slot.controller.abort();
      return;
    }
    URL.revokeObjectURL(slot.url);
    this.derived -= slot.bytes;
  }

  private evict(): void {
    while (
      this.idle.length > 0 &&
      (this.slots.size > this.capacity || this.derived > this.byteBudget)
    ) {
      const name = this.idle.shift()!;
      const slot = this.slots.get(name);
      if (!slot || slot.refs > 0 || slot.url === null) continue;
      URL.revokeObjectURL(slot.url);
      this.derived -= slot.bytes;
      this.slots.delete(name);
    }
  }

  private forget(name: string): void {
    const at = this.idle.indexOf(name);
    if (at !== -1) this.idle.splice(at, 1);
  }
}
