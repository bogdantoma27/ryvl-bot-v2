/**
 * A small in-memory cache with a time-to-live and a size cap. Concurrent callers of the
 * same key share one load, and failed loads are not cached, so an error is retried by
 * the next caller instead of being served for the whole TTL.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: Promise<V>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const t = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > t) return hit.value;
    if (hit) this.entries.delete(key);

    const value = load();
    this.entries.set(key, { value, expiresAt: t + this.ttlMs });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    this.evict(t);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }

  private evict(t: number): void {
    if (this.entries.size <= this.maxEntries) return;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= t) this.entries.delete(key);
    }
    // Map iteration follows insertion order, so the oldest entries go first.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}
