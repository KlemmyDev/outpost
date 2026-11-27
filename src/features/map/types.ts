/** Shared between the Map's server side and its page. No Node imports. */

/** An installed offline map (a Kiwix maps ZIM). */
export interface MapSource {
  contentId: string
  title: string
  sizeBytes: number | null
  /** [[west, south], [east, north]], from the map's own config. */
  bounds: [[number, number], [number, number]] | null
}

export const WAYPOINT_KINDS = ['home', 'meet', 'water', 'fuel', 'medical', 'shelter', 'hazard', 'other'] as const
export type WaypointKind = (typeof WAYPOINT_KINDS)[number]

/**
 * How each kind looks: a word, a letter on the marker (so it's never colour
 * alone), a colour from the validated categorical palette (one slot each, in
 * the palette's order) and a letter colour that reads on it.
 */
export const KIND_STYLE: Record<WaypointKind, { label: string; letter: string; color: string; ink: string }> = {
  water: { label: 'Water', letter: 'W', color: '#2a78d6', ink: '#ffffff' },
  home: { label: 'Home', letter: 'H', color: '#eb6834', ink: '#ffffff' },
  shelter: { label: 'Shelter', letter: 'S', color: '#1baf7a', ink: '#0b0b0b' },
  hazard: { label: 'Hazard', letter: '!', color: '#eda100', ink: '#0b0b0b' },
  meet: { label: 'Meeting point', letter: 'M', color: '#e87ba4', ink: '#0b0b0b' },
  fuel: { label: 'Fuel', letter: 'F', color: '#008300', ink: '#ffffff' },
  other: { label: 'Other', letter: '•', color: '#6250d6', ink: '#ffffff' },
  medical: { label: 'Medical', letter: '+', color: '#e34948', ink: '#ffffff' },
}

export interface Waypoint {
  id: number
  name: string
  kind: WaypointKind
  lat: number
  lon: number
  notes: string
  createdAt: number
  updatedAt: number
}

export type PlaceKind = 'city' | 'town' | 'village' | 'suburb' | 'hamlet' | 'locality' | 'peak' | 'water' | 'island' | 'state' | 'country' | 'other'

export interface PlaceHit {
  name: string
  kind: PlaceKind
  lat: number
  lon: number
}

export interface IndexStatus {
  contentId: string
  state: 'idle' | 'building' | 'ready' | 'failed'
  done: number
  total: number
  places: number
  builtAt: number | null
  error: string | null
}

export interface MapData {
  /** The Library is needed for map files. */
  libraryOnline: boolean
  sources: MapSource[]
  /** The map being shown. */
  current: MapSource | null
  waypoints: Waypoint[]
  index: IndexStatus | null
  /** A map download in progress, from the Library. */
  download: { title: string; bytes: number; sizeBytes: number; state: string } | null
}

/** The Map's Overview card. */
export interface MapStatus {
  map: string | null
  waypoints: number
  homeSet: boolean
  download: { title: string; bytes: number; sizeBytes: number } | null
}
