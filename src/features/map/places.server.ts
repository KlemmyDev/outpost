import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { PLACE_RANK } from './store.server'
import type { PlaceHit, PlaceKind } from './types'

/**
 * Builds a place-name index from a map's own vector tiles, so places can be
 * searched with no internet. The map files have no search of their own, but
 * their tiles carry every labelled town, suburb, peak and lake: reading the
 * tiles at a couple of zoom levels across the map's area finds them all.
 */

export type Bounds = [[number, number], [number, number]]

/** Zoom 6 has states and big cities; zoom 10 has towns, villages, peaks and lakes. */
export const INDEX_ZOOMS = [6, 10]

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

export function latToTileY(lat: number, z: number): number {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export function tilesFor(bounds: Bounds, z: number): [number, number, number][] {
  const [[w, s], [e, n]] = bounds
  const max = 2 ** z - 1
  const x0 = Math.max(0, lonToTileX(w, z))
  const x1 = Math.min(max, lonToTileX(e, z))
  const y0 = Math.max(0, latToTileY(n, z))
  const y1 = Math.min(max, latToTileY(s, z))
  const out: [number, number, number][] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y])
  return out
}

const PLACE_CLASS: Record<string, PlaceKind> = {
  country: 'country',
  state: 'state',
  province: 'state',
  city: 'city',
  town: 'town',
  village: 'village',
  suburb: 'suburb',
  quarter: 'suburb',
  neighbourhood: 'suburb',
  hamlet: 'hamlet',
  isolated_dwelling: 'hamlet',
  locality: 'locality',
  island: 'island',
  islet: 'island',
}

function nameOf(props: Record<string, unknown>): string {
  for (const key of ['name:en', 'name_en', 'name', 'name:latin']) {
    const v = props[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Every named place in one tile. */
export function placesInTile(buf: Uint8Array, z: number, x: number, y: number): (PlaceHit & { rank: number })[] {
  const tile = new VectorTile(new PbfReader(buf))
  const out: (PlaceHit & { rank: number })[] = []
  const take = (layer: string, kindOf: (props: Record<string, unknown>) => PlaceKind | null) => {
    const l = tile.layers[layer]
    if (!l) return
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i)
      const props = f.properties as Record<string, unknown>
      const kind = kindOf(props)
      const name = nameOf(props)
      if (!kind || !name) continue
      const geo = f.toGeoJSON(x, y, z).geometry
      const point =
        geo.type === 'Point' ? geo.coordinates : geo.type === 'MultiPoint' || geo.type === 'LineString' ? geo.coordinates[0] : geo.type === 'MultiLineString' ? geo.coordinates[0]?.[0] : null
      if (!point) continue
      out.push({ name, kind, rank: PLACE_RANK[kind], lon: Math.round(point[0]! * 1e5) / 1e5, lat: Math.round(point[1]! * 1e5) / 1e5 })
    }
  }
  take('place', (p) => PLACE_CLASS[String(p.class)] ?? null)
  take('mountain_peak', () => 'peak')
  take('water_name', () => 'water')
  return out
}

export interface BuildOptions {
  bounds: Bounds
  fetchTile: (z: number, x: number, y: number) => Promise<Uint8Array | null>
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  concurrency?: number
}

/** Reads every tile at the index zooms, de-duplicating places that appear in more than one. */
export async function buildPlaceIndex({ bounds, fetchTile, onProgress, signal, concurrency = 16 }: BuildOptions): Promise<(PlaceHit & { rank: number })[]> {
  const tiles = INDEX_ZOOMS.flatMap((z) => tilesFor(bounds, z))
  const seen = new Map<string, PlaceHit & { rank: number }>()
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < tiles.length) {
      if (signal?.aborted) throw new Error('aborted')
      const [z, x, y] = tiles[next++]!
      const buf = await fetchTile(z, x, y).catch(() => null)
      if (buf && buf.length) {
        try {
          for (const p of placesInTile(buf, z, x, y)) {
            const key = `${p.name.toLowerCase()}|${p.kind}|${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`
            if (!seen.has(key)) seen.set(key, p)
          }
        } catch {
          // A tile that won't decode just has no places.
        }
      }
      done++
      if (done % 200 === 0 || done === tiles.length) onProgress?.(done, tiles.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker))
  return [...seen.values()]
}
