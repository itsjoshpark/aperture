import type { ImageEntry } from "./fs/types";

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
 */

const DEFAULT_CAPACITY = 300;

interface CacheEntry {
  url: string;
  refs: number;
}

export class ThumbnailCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<string>>();
  /** Names of released entries, least recently used first. */
  private readonly idle: string[] = [];
  private readonly capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  /** Number of live object URLs. Test affordance. */
  get size(): number {
    return this.entries.size;
  }

  async acquire(entry: ImageEntry): Promise<string> {
    const existing = this.entries.get(entry.name);
    if (existing) {
      existing.refs += 1;
      this.forget(entry.name);
      return existing.url;
    }

    // Two tiles can ask for the same file before the first read finishes —
    // share the read rather than creating two URLs for one file.
    const inFlight = this.pending.get(entry.name);
    if (inFlight) {
      await inFlight;
      return this.acquire(entry);
    }

    const load = entry
      .getFile()
      .then((file) => URL.createObjectURL(file))
      .finally(() => this.pending.delete(entry.name));
    this.pending.set(entry.name, load);

    const url = await load;
    this.entries.set(entry.name, { url, refs: 1 });
    return url;
  }

  release(name: string): void {
    const entry = this.entries.get(name);
    if (!entry) return;

    entry.refs -= 1;
    if (entry.refs > 0) return;

    this.forget(name);
    this.idle.push(name);
    this.evict();
  }

  /**
   * Drop everything. Called after a rename, because names are the cache keys and
   * they have all just changed — `1.jpg` may now be a completely different photo.
   */
  clear(): void {
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url);
    this.entries.clear();
    this.idle.length = 0;
  }

  /** Drop one file, e.g. after deleting it. */
  invalidate(name: string): void {
    const entry = this.entries.get(name);
    if (!entry) return;
    URL.revokeObjectURL(entry.url);
    this.entries.delete(name);
    this.forget(name);
  }

  private evict(): void {
    while (this.idle.length > 0 && this.entries.size > this.capacity) {
      const name = this.idle.shift()!;
      const entry = this.entries.get(name);
      if (!entry || entry.refs > 0) continue;
      URL.revokeObjectURL(entry.url);
      this.entries.delete(name);
    }
  }

  private forget(name: string): void {
    const at = this.idle.indexOf(name);
    if (at !== -1) this.idle.splice(at, 1);
  }
}
