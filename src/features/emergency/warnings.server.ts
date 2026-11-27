import { XMLParser } from 'fast-xml-parser'
import { distance } from '#/features/map/geo'
import type { AuState, Warning, WarningLevel } from './types'

/**
 * Official warnings, from the agencies' public feeds:
 *
 * - Bureau of Meteorology: weather and flood warnings for each state (RSS).
 * - Queensland Fire Department: bushfire warnings (GeoJSON).
 * - NSW Rural Fire Service: major fire incidents (GeoJSON).
 * - VicEmergency: warnings for fire, flood, storm and more (GeoJSON).
 *
 * These are the feeds behind the agencies' own maps, not official APIs, so
 * any of them can change. WA, SA, Tasmania and the NT get BOM's warnings only
 * for now.
 */

export const BOM_FEEDS: Record<AuState, string> = {
  NSW: 'http://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml',
  ACT: 'http://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml',
  NT: 'http://www.bom.gov.au/fwo/IDZ00055.warnings_nt.xml',
  QLD: 'http://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml',
  SA: 'http://www.bom.gov.au/fwo/IDZ00057.warnings_sa.xml',
  TAS: 'http://www.bom.gov.au/fwo/IDZ00058.warnings_tas.xml',
  VIC: 'http://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml',
  WA: 'http://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml',
}

export const FIRE_FEEDS: Partial<Record<AuState, { source: string; url: string; parse: (d: unknown) => Warning[] }>> = {}

const LEVELS: WarningLevel[] = ['Emergency Warning', 'Watch and Act', 'Advice']
export const LEVEL_RANK: Record<WarningLevel, number> = { 'Emergency Warning': 0, 'Watch and Act': 1, Advice: 2, Weather: 3 }

function level(v: unknown): WarningLevel | null {
  const s = String(v ?? '').trim().toLowerCase()
  return LEVELS.find((l) => l.toLowerCase() === s) ?? null
}

type Geo = { type: string; coordinates?: unknown; geometries?: Geo[] }

/** A point to measure from: a point, or the middle of a shape. */
export function pointOf(g: Geo | null | undefined): { lat: number; lon: number } | null {
  if (!g) return null
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const [lon, lat] = g.coordinates as number[]
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : null
  }
  if (g.type === 'GeometryCollection' && g.geometries) {
    return pointOf(g.geometries.find((x) => x.type === 'Point')) ?? pointOf(g.geometries[0])
  }
  const ring = g.type === 'Polygon' ? (g.coordinates as number[][][])?.[0] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][])?.[0]?.[0] : null
  if (!ring?.length) return null
  const lon = ring.reduce((a, p) => a + p[0]!, 0) / ring.length
  const lat = ring.reduce((a, p) => a + p[1]!, 0) / ring.length
  return { lat, lon }
}

const strip = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim()

/** "Fri, 27 Nov 2026 01:36:37 GMT" or ISO. */
const when = (v: unknown): number | null => {
  const t = Date.parse(String(v ?? ''))
  return Number.isFinite(t) ? t : null
}

/** "27/11/2026 7:22:00 AM", as NSW sends it (Sydney time, near enough for ordering). */
function auDate(v: unknown): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::\d{2})? ?(AM|PM)?$/i.exec(String(v ?? '').trim())
  if (!m) return null
  let h = Number(m[4])
  if (m[6]?.toUpperCase() === 'PM' && h < 12) h += 12
  if (m[6]?.toUpperCase() === 'AM' && h === 12) h = 0
  return Date.parse(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5]}:00+10:00`)
}

const xml = new XMLParser({ ignoreAttributes: true, isArray: (n) => n === 'item' })

export function parseBom(text: string): Warning[] {
  const doc = xml.parse(text) as { rss?: { channel?: { item?: Record<string, unknown>[] } } }
  return (doc.rss?.channel?.item ?? []).map((it) => {
    // Titles start with "27/11:36 EST "; the issue time is in pubDate.
    const title = String(it.title ?? '').replace(/^\d{1,2}\/\d{1,2}:\d{2}\s+[A-Z]{3,4}\s+/, '')
    const url = typeof it.link === 'string' ? it.link.replace(/^http:\/\/reg\.bom/, 'http://www.bom') : null
    return { id: `bom:${String(it.guid ?? it.link ?? title)}`, source: 'Bureau of Meteorology', level: 'Weather' as const, title, action: null, url, issued: when(it.pubDate), distanceKm: null, lat: null, lon: null }
  })
}

type Feature = { geometry?: Geo; properties?: Record<string, unknown> }
const features = (d: unknown): Feature[] => (Array.isArray((d as { features?: unknown })?.features) ? (d as { features: Feature[] }).features : [])

export function parseQfd(d: unknown): Warning[] {
  return features(d).flatMap((f) => {
    const p = f.properties ?? {}
    const lv = level(p.WarningLevel)
    if (!lv) return []
    const lat = Number(p.Latitude)
    const lon = Number(p.Longitude)
    const pt = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : pointOf(f.geometry)
    return [
      {
        id: `qfd:${String(p.UniqueID ?? p.OBJECTID)}`,
        source: 'Queensland Fire Department',
        level: lv,
        title: String(p.WarningTitle ?? 'Bushfire warning'),
        action: p.CallToAction ? String(p.CallToAction) : null,
        url: 'https://www.fire.qld.gov.au/Current-Incidents',
        issued: when(p.ItemDateTimeLocal_ISO ?? p.PublishDateLocal_ISO),
        distanceKm: null,
        lat: pt?.lat ?? null,
        lon: pt?.lon ?? null,
      },
    ]
  })
}

export function parseRfs(d: unknown): Warning[] {
  return features(d).flatMap((f) => {
    const p = f.properties ?? {}
    const lv = level(p.category)
    if (!lv) return []
    const pt = pointOf(f.geometry)
    const desc = strip(String(p.description ?? ''))
    const status = /STATUS:\s*([^\n]+)/.exec(desc)?.[1]?.trim()
    const type = /TYPE:\s*([^\n]+)/.exec(desc)?.[1]?.trim()
    return [
      {
        id: `rfs:${String(p.guid ?? p.title)}`,
        source: 'NSW Rural Fire Service',
        level: lv,
        title: `${type ?? 'Fire'}: ${String(p.title ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`,
        action: status ?? null,
        url: typeof p.link === 'string' ? p.link : 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
        issued: auDate(p.pubDate),
        distanceKm: null,
        lat: pt?.lat ?? null,
        lon: pt?.lon ?? null,
      },
    ]
  })
}

export function parseVic(d: unknown): Warning[] {
  return features(d).flatMap((f) => {
    const p = f.properties ?? {}
    if (p.feedType !== 'warning') return []
    const lv = level(p.category1)
    if (!lv) return []
    const pt = pointOf(f.geometry)
    const cap = (p.cap ?? {}) as Record<string, unknown>
    const event = String(cap.event ?? p.category2 ?? 'Warning')
    return [
      {
        id: `vic:${String(p.id ?? p.sourceId)}`,
        source: 'VicEmergency',
        level: lv,
        title: `${event}: ${String(p.location ?? '')}`.replace(/:\s*$/, ''),
        action: p.action ? String(p.action) : null,
        url: typeof p.url === 'string' ? p.url : 'https://emergency.vic.gov.au/respond/',
        issued: when(p.updated ?? p.created),
        distanceKm: null,
        lat: pt?.lat ?? null,
        lon: pt?.lon ?? null,
      },
    ]
  })
}

FIRE_FEEDS.QLD = { source: 'Queensland Fire Department', url: 'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json', parse: parseQfd }
FIRE_FEEDS.NSW = { source: 'NSW Rural Fire Service', url: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json', parse: parseRfs }
FIRE_FEEDS.ACT = FIRE_FEEDS.NSW
FIRE_FEEDS.VIC = { source: 'VicEmergency', url: 'https://emergency.vic.gov.au/public/events-geojson.json', parse: parseVic }

/** BOM warnings that are worth a notification. */
export function severeWeather(w: Warning): boolean {
  return /severe thunderstorm|severe weather|cyclone|major flood|moderate flood|fire weather|tsunami|damaging winds|destructive/i.test(w.title) && !/cancellation|final/i.test(w.title)
}

/** Which state a point is in, near enough to pick a default. */
export function stateAt(lat: number, lon: number): AuState {
  if (lat >= -35.92 && lat <= -35.12 && lon >= 148.76 && lon <= 149.4) return 'ACT'
  if (lat < -39.5) return 'TAS'
  if (lon < 129) return 'WA'
  if (lon < 138 && lat > -26) return 'NT'
  if (lon < 141) return 'SA'
  if (lat > -29) return 'QLD'
  // Victoria lies south of the Murray, then the straight border to Cape Howe.
  if (lat < borderLat(lon)) return 'VIC'
  return 'NSW'
}

/** The NSW–Victoria border's latitude at a longitude: points along the Murray, then the line to Cape Howe. */
const BORDER: [number, number][] = [
  [141, -34.0],
  [142.15, -34.18], // Mildura
  [143.55, -35.33], // Swan Hill
  [144.75, -36.12], // Echuca
  [146.92, -36.08], // Albury
  [147.9, -36.2], // Corryong
  [148.2, -36.8],
  [149.98, -37.5], // Cape Howe
]

function borderLat(lon: number): number {
  if (lon <= BORDER[0]![0]) return BORDER[0]![1]
  for (let i = 1; i < BORDER.length; i++) {
    const [x1, y1] = BORDER[i]!
    const [x0, y0] = BORDER[i - 1]!
    if (lon <= x1) return y0 + ((lon - x0) / (x1 - x0)) * (y1 - y0)
  }
  return BORDER.at(-1)![1]
}

/** Measures each warning from Home, keeps those within the radius (and all of BOM's), most urgent first. */
export function arrange(list: Warning[], home: { lat: number; lon: number } | null, radiusKm: number): Warning[] {
  return list
    .map((w) => (home && w.lat !== null && w.lon !== null ? { ...w, distanceKm: Math.round(distance(home, { lat: w.lat, lon: w.lon }) / 100) / 10 } : w))
    .filter((w) => w.level === 'Weather' || !home || (w.distanceKm !== null && w.distanceKm <= radiusKm))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || (b.issued ?? 0) - (a.issued ?? 0))
}
