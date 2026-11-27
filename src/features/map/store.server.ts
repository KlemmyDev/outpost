import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '#/platform/server/db.server'
import { WAYPOINT_KINDS, type PlaceHit, type PlaceKind, type Waypoint, type WaypointKind } from './types'

/** The Map's own tables, migrated in the "map" namespace. */
export const MIGRATIONS: Migration[] = [
  `CREATE TABLE map_waypoints (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT NOT NULL,
     kind       TEXT NOT NULL,
     lat        REAL NOT NULL,
     lon        REAL NOT NULL,
     notes      TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE map_places (
     id         INTEGER PRIMARY KEY,
     content_id TEXT NOT NULL,
     name       TEXT NOT NULL,
     kind       TEXT NOT NULL,
     rank       INTEGER NOT NULL,
     lat        REAL NOT NULL,
     lon        REAL NOT NULL
   );
   CREATE INDEX map_places_source ON map_places (content_id);
   CREATE VIRTUAL TABLE map_places_fts USING fts5(name, content='map_places', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
   CREATE TABLE map_index (
     content_id TEXT PRIMARY KEY,
     places     INTEGER NOT NULL,
     built_at   INTEGER NOT NULL
   )`,
]

interface WaypointRow {
  id: number
  name: string
  kind: string
  lat: number
  lon: number
  notes: string
  created_at: number
  updated_at: number
}

const toWaypoint = (r: WaypointRow): Waypoint => ({
  id: r.id,
  name: r.name,
  kind: (WAYPOINT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as WaypointKind) : 'other',
  lat: r.lat,
  lon: r.lon,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

/** Lower is more important: what a search shows first. */
export const PLACE_RANK: Record<PlaceKind, number> = {
  country: 0,
  state: 1,
  city: 2,
  town: 3,
  village: 4,
  suburb: 5,
  island: 6,
  peak: 7,
  water: 8,
  hamlet: 9,
  locality: 10,
  other: 11,
}

export interface WaypointInput {
  name: string
  kind: WaypointKind
  lat: number
  lon: number
  notes: string
}

/** Checks and tidies a waypoint from the page. Throws with a readable message. */
export function cleanWaypoint(w: Partial<WaypointInput>): WaypointInput {
  const lat = Number(w.lat)
  const lon = Number(w.lon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("That position isn't on the map.")
  const name = String(w.name ?? '').trim().slice(0, 80)
  if (!name) throw new Error('Give the waypoint a name.')
  const kind = (WAYPOINT_KINDS as readonly string[]).includes(String(w.kind)) ? (w.kind as WaypointKind) : 'other'
  return { name, kind, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, notes: String(w.notes ?? '').slice(0, 2000) }
}

export class MapStore {
  constructor(private readonly db: DatabaseSync) {}

  waypoints(): Waypoint[] {
    return (this.db.prepare('SELECT * FROM map_waypoints ORDER BY kind = \'home\' DESC, name COLLATE NOCASE').all() as unknown as WaypointRow[]).map(toWaypoint)
  }

  addWaypoint(w: WaypointInput): Waypoint {
    const now = Date.now()
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO map_waypoints (name, kind, lat, lon, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(w.name, w.kind, w.lat, w.lon, w.notes, now, now)
    return this.waypoint(Number(lastInsertRowid))!
  }

  updateWaypoint(id: number, w: WaypointInput): Waypoint | null {
    this.db.prepare('UPDATE map_waypoints SET name = ?, kind = ?, lat = ?, lon = ?, notes = ?, updated_at = ? WHERE id = ?').run(w.name, w.kind, w.lat, w.lon, w.notes, Date.now(), id)
    return this.waypoint(id)
  }

  waypoint(id: number): Waypoint | null {
    const r = this.db.prepare('SELECT * FROM map_waypoints WHERE id = ?').get(id) as unknown as WaypointRow | undefined
    return r ? toWaypoint(r) : null
  }

  deleteWaypoint(id: number): void {
    this.db.prepare('DELETE FROM map_waypoints WHERE id = ?').run(id)
  }

  // Place index

  indexed(contentId: string): { places: number; builtAt: number } | null {
    const r = this.db.prepare('SELECT places, built_at FROM map_index WHERE content_id = ?').get(contentId) as { places: number; built_at: number } | undefined
    return r ? { places: r.places, builtAt: r.built_at } : null
  }

  /** Replaces a map's places in one transaction. */
  replacePlaces(contentId: string, places: (PlaceHit & { rank: number })[]): void {
    this.db.exec('BEGIN')
    try {
      this.dropPlaces(contentId)
      const ins = this.db.prepare('INSERT INTO map_places (content_id, name, kind, rank, lat, lon) VALUES (?, ?, ?, ?, ?, ?)')
      const fts = this.db.prepare('INSERT INTO map_places_fts (rowid, name) VALUES (?, ?)')
      for (const p of places) {
        const { lastInsertRowid } = ins.run(contentId, p.name, p.kind, p.rank, p.lat, p.lon)
        fts.run(lastInsertRowid, p.name)
      }
      this.db.prepare('INSERT OR REPLACE INTO map_index (content_id, places, built_at) VALUES (?, ?, ?)').run(contentId, places.length, Date.now())
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  private dropPlaces(contentId: string): void {
    const ids = this.db.prepare('SELECT id, name FROM map_places WHERE content_id = ?').all(contentId) as { id: number; name: string }[]
    const del = this.db.prepare("INSERT INTO map_places_fts (map_places_fts, rowid, name) VALUES ('delete', ?, ?)")
    for (const r of ids) del.run(r.id, r.name)
    this.db.prepare('DELETE FROM map_places WHERE content_id = ?').run(contentId)
    this.db.prepare('DELETE FROM map_index WHERE content_id = ?').run(contentId)
  }

  forgetPlaces(contentId: string): void {
    this.db.exec('BEGIN')
    try {
      this.dropPlaces(contentId)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Places whose name starts with what's typed (word by word), biggest first. */
  searchPlaces(contentId: string, q: string, limit = 12, near?: { lat: number; lon: number }): PlaceHit[] {
    const words = q
      .toLowerCase()
      .replace(/["*^():]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
    if (!words.length) return []
    const match = words.map((w) => `"${w}"*`).join(' ')
    const rows = this.db
      .prepare(
        `SELECT p.name, p.kind, p.lat, p.lon, p.rank FROM map_places_fts f JOIN map_places p ON p.id = f.rowid
         WHERE map_places_fts MATCH ? AND p.content_id = ?
         ORDER BY p.rank, length(p.name) LIMIT 200`,
      )
      .all(match, contentId) as unknown as (PlaceHit & { rank: number })[]
    const exact = (r: PlaceHit) => (r.name.toLowerCase() === q.trim().toLowerCase() ? 0 : r.name.toLowerCase().startsWith(q.trim().toLowerCase()) ? 1 : 2)
    const dist = (r: PlaceHit) => (near ? (r.lat - near.lat) ** 2 + (r.lon - near.lon) ** 2 : 0)
    return rows
      .sort((a, b) => exact(a) - exact(b) || a.rank - b.rank || dist(a) - dist(b))
      .slice(0, limit)
      .map(({ name, kind, lat, lon }) => ({ name, kind, lat, lon }))
  }
}
