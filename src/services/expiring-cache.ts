export class ExpiringCache<T> {
  private rows = new Map<string, { expires: number; value: T }>();
  constructor(private ttl: number, private max = 1000) {}
  get(key: string, now = Date.now()): T | undefined {
    const row = this.rows.get(key);
    if (!row) return undefined;
    if (row.expires <= now) { this.rows.delete(key); return undefined; }
    return row.value;
  }
  set(key: string, value: T, now = Date.now()) {
    for (const [id, row] of this.rows) if (row.expires <= now) this.rows.delete(id);
    this.rows.delete(key);
    while (this.rows.size >= this.max) this.rows.delete(this.rows.keys().next().value!);
    this.rows.set(key, { value, expires: now + this.ttl });
  }
  delete(key: string) { this.rows.delete(key); }
  deletePrefix(prefix: string) { for (const id of this.rows.keys()) if (id.startsWith(prefix)) this.rows.delete(id); }
}
