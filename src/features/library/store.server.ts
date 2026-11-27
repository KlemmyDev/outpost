import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '#/platform/server/db.server'
import type { Bookmark, Download, DownloadState, HistoryItem } from './types'

/** The Library's own tables, migrated in the "library" namespace. */
export const MIGRATIONS: Migration[] = [
  `CREATE TABLE library_downloads (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT NOT NULL,
     flavour    TEXT NOT NULL,
     title      TEXT NOT NULL,
     content_id TEXT NOT NULL,
     url        TEXT NOT NULL,
     size_bytes INTEGER NOT NULL,
     bytes      INTEGER NOT NULL DEFAULT 0,
     state      TEXT NOT NULL,
     error      TEXT,
     replaces   TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE library_bookmarks (
     content_id TEXT NOT NULL,
     path       TEXT NOT NULL,
     title      TEXT NOT NULL,
     book_title TEXT NOT NULL,
     saved_at   INTEGER NOT NULL,
     PRIMARY KEY (content_id, path)
   )`,
  `CREATE TABLE library_history (
     content_id TEXT NOT NULL,
     path       TEXT NOT NULL,
     title      TEXT NOT NULL,
     book_title TEXT NOT NULL,
     visited_at INTEGER NOT NULL,
     PRIMARY KEY (content_id, path)
   );
   CREATE INDEX library_history_visited ON library_history (visited_at)`,
]

/** History keeps this many pages, newest first. */
export const HISTORY_LIMIT = 200

interface DownloadRow {
  id: number
  name: string
  flavour: string
  title: string
  content_id: string
  url: string
  size_bytes: number
  bytes: number
  state: DownloadState
  error: string | null
  replaces: string | null
  created_at: number
  updated_at: number
}
interface PageRow {
  content_id: string
  path: string
  title: string
  book_title: string
  saved_at?: number
  visited_at?: number
}

const toDownload = (r: DownloadRow): Download => ({
  id: r.id,
  name: r.name,
  flavour: r.flavour,
  title: r.title,
  contentId: r.content_id,
  url: r.url,
  sizeBytes: r.size_bytes,
  bytes: r.bytes,
  state: r.state,
  error: r.error,
  replaces: r.replaces,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  bytesPerSec: null,
  verified: null,
})

export class LibraryStore {
  constructor(private readonly db: DatabaseSync) {}

  // Downloads

  addDownload(d: Pick<Download, 'name' | 'flavour' | 'title' | 'contentId' | 'url' | 'sizeBytes' | 'replaces'>): Download {
    const now = Date.now()
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO library_downloads (name, flavour, title, content_id, url, size_bytes, state, replaces, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
      )
      .run(d.name, d.flavour, d.title, d.contentId, d.url, Math.round(d.sizeBytes), d.replaces, now, now)
    return this.download(Number(lastInsertRowid))!
  }

  download(id: number): Download | null {
    const row = this.db.prepare('SELECT * FROM library_downloads WHERE id = ?').get(id) as unknown as DownloadRow | undefined
    return row ? toDownload(row) : null
  }

  /** Everything not finished or cancelled, oldest first, plus the last few finished. */
  downloads(): Download[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM library_downloads
         WHERE state NOT IN ('done', 'cancelled') OR updated_at > ?
         ORDER BY id`,
      )
      .all(Date.now() - 24 * 60 * 60 * 1000) as unknown as DownloadRow[]
    return rows.filter((r) => r.state !== 'cancelled').map(toDownload)
  }

  active(): Download[] {
    const rows = this.db
      .prepare(`SELECT * FROM library_downloads WHERE state IN ('queued', 'downloading', 'verifying') ORDER BY id`)
      .all() as unknown as DownloadRow[]
    return rows.map(toDownload)
  }

  /** Same file already queued or on its way? */
  pendingFor(contentId: string): Download | null {
    const row = this.db
      .prepare(`SELECT * FROM library_downloads WHERE content_id = ? AND state IN ('queued', 'downloading', 'verifying', 'paused', 'failed') ORDER BY id DESC LIMIT 1`)
      .get(contentId) as unknown as DownloadRow | undefined
    return row ? toDownload(row) : null
  }

  update(id: number, patch: Partial<Pick<Download, 'bytes' | 'state' | 'error' | 'sizeBytes'>>): void {
    const sets: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [Date.now()]
    if (patch.bytes !== undefined) sets.push('bytes = ?'), values.push(Math.round(patch.bytes))
    if (patch.sizeBytes !== undefined) sets.push('size_bytes = ?'), values.push(Math.round(patch.sizeBytes))
    if (patch.state !== undefined) sets.push('state = ?'), values.push(patch.state)
    if (patch.error !== undefined) sets.push('error = ?'), values.push(patch.error)
    this.db.prepare(`UPDATE library_downloads SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }

  /** Once a book is removed, its finished download stops being listed. */
  retireFinished(contentId: string): void {
    this.db.prepare(`UPDATE library_downloads SET state = 'cancelled', updated_at = ? WHERE content_id = ? AND state = 'done'`).run(Date.now(), contentId)
  }

  /** After a restart, anything that was mid-download goes back in the queue. */
  requeueInterrupted(): number {
    return Number(
      this.db.prepare(`UPDATE library_downloads SET state = 'queued', updated_at = ? WHERE state IN ('downloading', 'verifying')`).run(Date.now()).changes,
    )
  }

  // Bookmarks

  isSaved(contentId: string, path: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM library_bookmarks WHERE content_id = ? AND path = ?').get(contentId, path)
  }

  setSaved(page: Omit<Bookmark, 'savedAt'>, saved: boolean): void {
    if (saved) {
      this.db
        .prepare('INSERT OR REPLACE INTO library_bookmarks (content_id, path, title, book_title, saved_at) VALUES (?, ?, ?, ?, ?)')
        .run(page.contentId, page.path, page.title, page.bookTitle, Date.now())
    } else {
      this.db.prepare('DELETE FROM library_bookmarks WHERE content_id = ? AND path = ?').run(page.contentId, page.path)
    }
  }

  bookmarks(limit = 500): Bookmark[] {
    const rows = this.db.prepare('SELECT * FROM library_bookmarks ORDER BY saved_at DESC LIMIT ?').all(limit) as unknown as PageRow[]
    return rows.map((r) => ({ contentId: r.content_id, path: r.path, title: r.title, bookTitle: r.book_title, savedAt: r.saved_at! }))
  }

  // History

  visit(page: Omit<HistoryItem, 'visitedAt'>): void {
    this.db
      .prepare('INSERT OR REPLACE INTO library_history (content_id, path, title, book_title, visited_at) VALUES (?, ?, ?, ?, ?)')
      .run(page.contentId, page.path, page.title, page.bookTitle, Date.now())
    this.db
      .prepare('DELETE FROM library_history WHERE rowid NOT IN (SELECT rowid FROM library_history ORDER BY visited_at DESC LIMIT ?)')
      .run(HISTORY_LIMIT)
  }

  history(limit = HISTORY_LIMIT): HistoryItem[] {
    const rows = this.db.prepare('SELECT * FROM library_history ORDER BY visited_at DESC LIMIT ?').all(limit) as unknown as PageRow[]
    return rows.map((r) => ({ contentId: r.content_id, path: r.path, title: r.title, bookTitle: r.book_title, visitedAt: r.visited_at! }))
  }

  removeHistory(contentId: string, path: string): void {
    this.db.prepare('DELETE FROM library_history WHERE content_id = ? AND path = ?').run(contentId, path)
  }

  clearHistory(): void {
    this.db.prepare('DELETE FROM library_history').run()
  }
}
