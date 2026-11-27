import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PbfWriter } from 'pbf'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bearing, compass, distance, formatCoord, formatDistance, parseCoord, toMgrs } from '#/features/map/geo'
import { buildPlaceIndex, latToTileY, lonToTileX, placesInTile, tilesFor } from '#/features/map/places.server'
import { cleanWaypoint, MapStore, MIGRATIONS } from '#/features/map/store.server'
import { migrate, openDatabase } from '#/platform/server/db.server'

const SYDNEY = { lat: -33.8688, lon: 151.2093 }
const MELBOURNE = { lat: -37.8136, lon: 144.9631 }

describe('geography', () => {
  it('measures distance and bearing', () => {
    expect(distance(SYDNEY, MELBOURNE) / 1000).toBeCloseTo(713.4, 0)
    expect(compass(bearing(SYDNEY, MELBOURNE))).toBe('SW')
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(4321)).toBe('4.32 km')
    expect(formatDistance(713_400)).toBe('713 km')
  })

  it('formats coordinates three ways', () => {
    expect(formatCoord(SYDNEY.lat, SYDNEY.lon, 'decimal')).toBe('-33.86880, 151.20930')
    expect(formatCoord(SYDNEY.lat, SYDNEY.lon, 'dms')).toBe('33°52′07.7″S 151°12′33.5″E')
    expect(toMgrs(SYDNEY.lat, SYDNEY.lon)).toBe('56H LH 34368 50948')
  })

  it('reads typed positions: decimal, hemispheres and MGRS', () => {
    expect(parseCoord('-33.8688, 151.2093')).toEqual(SYDNEY)
    expect(parseCoord('33.8688S 151.2093E')).toEqual(SYDNEY)
    const m = parseCoord('56H LH 34368 50948')!
    expect(m.lat).toBeCloseTo(SYDNEY.lat, 3)
    expect(m.lon).toBeCloseTo(SYDNEY.lon, 3)
    expect(parseCoord('Sydney')).toBeNull()
    expect(parseCoord('95, 10')).toBeNull()
  })
})

describe('tiles', () => {
  it('turns a bounding box into the tiles that cover it', () => {
    expect(lonToTileX(151.2093, 10)).toBe(942)
    expect(latToTileY(-33.8688, 10)).toBe(614)
    const tiles = tilesFor([[150, -35], [152, -33]], 10)
    const cols = lonToTileX(152, 10) - lonToTileX(150, 10) + 1
    const rows = latToTileY(-35, 10) - latToTileY(-33, 10) + 1
    expect(tiles.length).toBe(cols * rows)
    expect(tiles).toContainEqual([10, 942, 614])
    expect(tiles.every(([z]) => z === 10)).toBe(true)
  })
})

/** Writes a one-layer vector tile with point features, as the map files have. */
function tile(layer: string, features: { name: string; cls?: string; x: number; y: number }[]): Uint8Array {
  const keys = ['name', 'class']
  const values: string[] = []
  const val = (v: string) => (values.includes(v) ? values.indexOf(v) : values.push(v) - 1)
  const encoded = features.map((f) => ({ tags: [0, val(f.name), ...(f.cls ? [1, val(f.cls)] : [])], x: f.x, y: f.y }))
  const pbf = new PbfWriter()
  pbf.writeMessage(3, (_: unknown, p: PbfWriter) => {
    p.writeVarintField(15, 2)
    p.writeStringField(1, layer)
    for (const f of encoded) {
      p.writeMessage(2, (_: unknown, q: PbfWriter) => {
        q.writePackedVarint(2, f.tags)
        q.writeVarintField(3, 1)
        const zig = (n: number) => (n << 1) ^ (n >> 31)
        q.writePackedVarint(4, [9, zig(f.x), zig(f.y)])
      }, null)
    }
    for (const k of keys) p.writeStringField(3, k)
    for (const v of values) p.writeMessage(4, (_: unknown, q: PbfWriter) => q.writeStringField(1, v), null)
    p.writeVarintField(5, 4096)
  }, null)
  return pbf.finish()
}

describe('place index', () => {
  it('reads named places out of a tile with their positions', () => {
    const buf = tile('place', [
      { name: 'Alofi', cls: 'town', x: 2048, y: 2048 },
      { name: 'Nowhere', cls: 'continent', x: 10, y: 10 },
    ])
    const places = placesInTile(buf, 10, 28, 568)
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ name: 'Alofi', kind: 'town' })
    expect(places[0]!.lon).toBeCloseTo(-170.0, 0)
  })

  it('reads every tile once and keeps one copy of a repeated place', async () => {
    const asked: string[] = []
    const places = await buildPlaceIndex({
      bounds: [[150.9, -34], [151.3, -33.7]],
      concurrency: 4,
      fetchTile: async (z, x, y) => {
        asked.push(`${z}/${x}/${y}`)
        return z === 10 ? tile('place', [{ name: 'Parramatta', cls: 'suburb', x: 100, y: 100 }]) : tile('mountain_peak', [{ name: 'Mount Tomah', x: 50, y: 50 }])
      },
    })
    expect(new Set(asked).size).toBe(asked.length)
    expect(places.filter((p) => p.kind === 'peak').length).toBeGreaterThan(0)
    // Same name in neighbouring tiles is a different spot, so it isn't merged.
    expect(places.filter((p) => p.name === 'Parramatta').length).toBe(asked.filter((a) => a.startsWith('10/')).length)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-map-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function store() {
  const db = openDatabase(join(dir, 'o.db'))
  migrate(db, 'map', MIGRATIONS)
  return new MapStore(db)
}

describe('waypoints', () => {
  it('checks what comes from the page', () => {
    expect(() => cleanWaypoint({ name: 'x', lat: 91, lon: 0 })).toThrow(/isn't on the map/)
    expect(() => cleanWaypoint({ name: '  ', lat: 0, lon: 0 })).toThrow(/name/)
    expect(cleanWaypoint({ name: ' Tank ', kind: 'bogus' as never, lat: -33.123456789, lon: 151 })).toEqual({ name: 'Tank', kind: 'other', lat: -33.123457, lon: 151, notes: '' })
  })

  it('adds, edits, lists home first, and deletes', () => {
    const s = store()
    const tank = s.addWaypoint({ name: 'Water tank', kind: 'water', lat: -33, lon: 151, notes: '' })
    s.addWaypoint({ name: 'Zed house', kind: 'home', lat: -33.1, lon: 151.1, notes: 'Gate code 1234' })
    expect(s.waypoints().map((w) => w.name)).toEqual(['Zed house', 'Water tank'])
    s.updateWaypoint(tank.id, { name: 'Big tank', kind: 'water', lat: -33.2, lon: 151, notes: '20 000 L' })
    expect(s.waypoint(tank.id)).toMatchObject({ name: 'Big tank', lat: -33.2, notes: '20 000 L' })
    s.deleteWaypoint(tank.id)
    expect(s.waypoints()).toHaveLength(1)
  })
})

describe('place search', () => {
  it('finds by prefix, biggest and exact first, and replaces cleanly', () => {
    const s = store()
    s.replacePlaces('au', [
      { name: 'Sydney', kind: 'city', rank: 2, lat: -33.87, lon: 151.21 },
      { name: 'North Sydney', kind: 'suburb', rank: 5, lat: -33.84, lon: 151.21 },
      { name: 'Sydenham', kind: 'suburb', rank: 5, lat: -33.91, lon: 151.17 },
      { name: 'Mount Kosciuszko', kind: 'peak', rank: 7, lat: -36.46, lon: 148.26 },
      { name: 'Wagga Wagga', kind: 'city', rank: 2, lat: -35.12, lon: 147.37 },
    ])
    expect(s.indexed('au')?.places).toBe(5)
    expect(s.searchPlaces('au', 'syd').map((p) => p.name)).toEqual(['Sydney', 'Sydenham', 'North Sydney'])
    expect(s.searchPlaces('au', 'kosci')[0]).toMatchObject({ name: 'Mount Kosciuszko', kind: 'peak' })
    expect(s.searchPlaces('au', 'wagga w').map((p) => p.name)).toEqual(['Wagga Wagga'])
    expect(s.searchPlaces('au', '"); DROP TABLE map_places; --')).toEqual([])
    expect(s.searchPlaces('other', 'syd')).toEqual([])
    s.replacePlaces('au', [{ name: 'Alofi', kind: 'town', rank: 3, lat: -19.05, lon: -169.92 }])
    expect(s.searchPlaces('au', 'syd')).toEqual([])
    expect(s.searchPlaces('au', 'alo')).toHaveLength(1)
    s.forgetPlaces('au')
    expect(s.indexed('au')).toBeNull()
  })
})
