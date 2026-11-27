import type { DatabaseSync } from 'node:sqlite'

/** A small key-value store for things people change in the UI. */
export class SettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      )
      .run(key, value)
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  getBool(key: string, fallback: boolean): boolean {
    const value = this.get(key)
    return value === null ? fallback : value === 'true'
  }

  setBool(key: string, value: boolean): void {
    this.set(key, value ? 'true' : 'false')
  }

  getJson<T>(key: string): T | null {
    const value = this.get(key)
    if (value === null) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }

  setJson(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value))
  }

  /** All settings whose key starts with `prefix`, with the prefix removed. */
  byPrefix(prefix: string): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all(`${prefix}%`) as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((r) => [r.key.slice(prefix.length), r.value]))
  }
}
