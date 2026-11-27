import * as mgrsModule from 'mgrs'

// The package ships CommonJS with named exports in its types; bundlers differ on which they give us.
const mgrs = ((mgrsModule as unknown as { default?: typeof mgrsModule }).default ?? mgrsModule) as typeof mgrsModule

const R = 6371008.8

/** Great-circle distance in metres. */
export function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Compass bearing from a to b, 0 to 360. */
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compass(deg: number): string {
  return POINTS[Math.round(deg / 45) % 8]!
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  if (m < 10_000) return `${(m / 1000).toFixed(2)} km`
  if (m < 100_000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000).toLocaleString('en-AU')} km`
}

export type CoordFormat = 'decimal' | 'dms' | 'mgrs'
export const COORD_FORMATS: CoordFormat[] = ['decimal', 'dms', 'mgrs']
export const COORD_LABEL: Record<CoordFormat, string> = { decimal: 'Decimal', dms: 'Degrees', mgrs: 'MGRS' }

function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = ((a - d) * 60 - m) * 60
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${v >= 0 ? pos : neg}`
}

/** MGRS with spaces between zone, square and digits: 56H LH 34368 50948. */
export function toMgrs(lat: number, lon: number): string {
  try {
    const raw = mgrs.forward([lon, lat], 5)
    const m = /^(\d{1,2}[A-Z])([A-Z]{2})(\d{5})(\d{5})$/.exec(raw)
    return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : raw
  } catch {
    // MGRS doesn't cover the poles.
    return '—'
  }
}

export function formatCoord(lat: number, lon: number, f: CoordFormat): string {
  if (f === 'mgrs') return toMgrs(lat, lon)
  if (f === 'dms') return `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/**
 * Reads a position typed into search: "-33.86, 151.21", "33.86S 151.21E"
 * or an MGRS reference like "56H LH 34368 50948". Null if it isn't one.
 */
export function parseCoord(q: string): { lat: number; lon: number } | null {
  const s = q.trim().toUpperCase()
  const compact = s.replace(/\s+/g, '')
  if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(\d{2}|\d{4}|\d{6}|\d{8}|\d{10})$/.test(compact)) {
    try {
      const [lon, lat] = mgrs.toPoint(compact)
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
    } catch {
      return null
    }
  }
  const m = /^(-?\d{1,2}(?:\.\d+)?)\s*([NS])?[\s,]+(-?\d{1,3}(?:\.\d+)?)\s*([EW])?$/.exec(s)
  if (!m) return null
  let lat = Number(m[1])
  let lon = Number(m[3])
  if (m[2] === 'S') lat = -Math.abs(lat)
  if (m[4] === 'W') lon = -Math.abs(lon)
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}
