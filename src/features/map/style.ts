import type { StyleSpecification } from 'maplibre-gl'

export type MapTheme = 'paper' | 'night'

/** Outpost's colours over the map file's own style, so the map sits with the rest of the app. */
const OVERRIDES: Record<MapTheme, Record<string, Record<string, unknown>>> = {
  paper: {
    background: { 'background-color': '#f4f2ec' },
    water: { 'fill-color': '#b9d3e6' },
    park: { 'fill-color': '#dbe7cf', 'fill-outline-color': 'rgba(78,154,122,0.5)' },
  },
  night: {},
}

/**
 * Loads a map file's style (the light or dark one Maps2ZIM ships) and points
 * every tile, font and sprite at Outpost's proxy for that file, so nothing is
 * fetched from the internet.
 */
export async function loadStyle(contentId: string, theme: MapTheme): Promise<StyleSpecification> {
  const base = `${window.location.origin}/api/library/raw/${encodeURIComponent(contentId)}/`
  const res = await fetch(`${base}assets/kiwix-${theme === 'night' ? 'dark' : 'light'}`)
  if (!res.ok) throw new Error(`The map's style didn't load (${res.status}).`)
  const style = (await res.json()) as StyleSpecification & Record<string, unknown>
  const abs = (u: string) => (u.startsWith('./') ? base + u.slice(2) : u)

  for (const [id, src] of Object.entries(style.sources)) {
    const s = src as unknown as Record<string, unknown>
    if (s.type === 'vector') {
      style.sources[id] = {
        type: 'vector',
        tiles: [`${base}tiles/{z}/{x}/{y}.pbf`],
        minzoom: 0,
        maxzoom: 14,
        attribution: '© OpenMapTiles · © OpenStreetMap contributors · OpenFreeMap',
      }
    } else if (Array.isArray(s.tiles)) {
      s.tiles = (s.tiles as string[]).map(abs)
    }
  }
  if (typeof style.sprite === 'string') style.sprite = abs(style.sprite)
  if (typeof style.glyphs === 'string') style.glyphs = abs(style.glyphs)

  for (const layer of style.layers) {
    const o = OVERRIDES[theme][layer.id]
    if (o && 'paint' in layer) layer.paint = { ...(layer.paint as object), ...o } as never
  }
  return style
}
