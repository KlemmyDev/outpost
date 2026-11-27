import { DatabaseSync } from 'node:sqlite'

/**
 * One SQLite file holds everything. Migrations are grouped by namespace, so
 * the platform ("core") and each feature module keep their own ordered list
 * and version, and a feature can be added or removed without renumbering
 * anyone else's migrations.
 */
export type Migration = string | ((db: DatabaseSync) => void)

export const CORE_MIGRATIONS: Migration[] = [
  `CREATE TABLE settings (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
   )`,
  `CREATE TABLE notifications (
     id      INTEGER PRIMARY KEY AUTOINCREMENT,
     at      INTEGER NOT NULL,
     feature TEXT NOT NULL,
     level   TEXT NOT NULL,
     title   TEXT NOT NULL,
     body    TEXT NOT NULL DEFAULT '',
     read_at INTEGER
   );
   CREATE INDEX notifications_at ON notifications (at)`,
]

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
     namespace TEXT PRIMARY KEY,
     version   INTEGER NOT NULL
   )`)
  migrate(db, 'core', CORE_MIGRATIONS)
  return db
}

export function schemaVersion(db: DatabaseSync, namespace: string): number {
  const row = db.prepare('SELECT version FROM schema_versions WHERE namespace = ?').get(namespace) as
    | { version: number }
    | undefined
  return row?.version ?? 0
}

/**
 * Applies the migrations a namespace hasn't had yet, each in its own
 * transaction. A database newer than the code (after a rollback) is left
 * alone with a warning, the same as WattsMyPower.
 */
export function migrate(db: DatabaseSync, namespace: string, migrations: readonly Migration[]): number {
  const current = schemaVersion(db, namespace)
  if (current > migrations.length) {
    console.warn(
      `[db] "${namespace}" schema is at version ${current} but this build only knows ${migrations.length}. ` +
        'Carrying on; this usually means the platform was rolled back.',
    )
    return current
  }
  for (let i = current; i < migrations.length; i++) {
    const step = migrations[i]!
    db.exec('BEGIN')
    try {
      if (typeof step === 'string') db.exec(step)
      else step(db)
      db.prepare(
        'INSERT INTO schema_versions (namespace, version) VALUES (?, ?) ON CONFLICT(namespace) DO UPDATE SET version = excluded.version',
      ).run(namespace, i + 1)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${namespace} #${i + 1} failed: ${(err as Error).message}`)
    }
  }
  return migrations.length
}
