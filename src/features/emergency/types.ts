/** Shared between the Emergency server side and its page. No Node imports. */

export const STATES = ['QLD', 'NSW', 'ACT', 'VIC', 'TAS', 'SA', 'WA', 'NT'] as const
export type AuState = (typeof STATES)[number]

/** The Australian Warning System's levels, and BOM's warnings. */
export type WarningLevel = 'Emergency Warning' | 'Watch and Act' | 'Advice' | 'Weather'

export interface Warning {
  id: string
  source: string
  level: WarningLevel
  title: string
  /** What to do, when the agency says. */
  action: string | null
  url: string | null
  issued: number | null
  /** From Home, when both are known. */
  distanceKm: number | null
  lat: number | null
  lon: number | null
}

export interface EmergencySettings {
  /** Which state's warnings to follow. Worked out from Home on the Map until it's chosen. */
  state: AuState | null
  /** Fire and emergency warnings within this distance of Home. */
  radiusKm: number
  /** Notify for new warnings near Home (Watch and Act and Emergency Warning always; Advice optionally). */
  notifyAdvice: boolean
  /** Notify for new severe weather, cyclone and moderate or major flood warnings. */
  notifyWeather: boolean
}

export const DEFAULT_EMERGENCY: EmergencySettings = { state: null, radiusKm: 50, notifyAdvice: false, notifyWeather: true }

export interface Person {
  id: string
  name: string
  phone: string
  /** Household, out-of-area contact, neighbour, doctor, vet… */
  role: string
  /** Conditions, medicines, allergies. */
  medical: string
}

export interface Plan {
  people: Person[]
  meetNear: string
  meetAway: string
  power: string
  gas: string
  water: string
  pets: string
  insurance: string
  notes: string
  updatedAt: number | null
}

export const EMPTY_PLAN: Plan = { people: [], meetNear: '', meetAway: '', power: '', gas: '', water: '', pets: '', insurance: '', notes: '', updatedAt: null }

export interface KitItem {
  id: string
  name: string
  hint: string
  have: boolean
  /** YYYY-MM-DD, for things that go off or run flat. */
  expires: string | null
  custom: boolean
}

export interface Kit {
  items: KitItem[]
  checkedAt: number | null
}

export type TileState = 'good' | 'warn' | 'bad' | 'off'

/** One line on the status board, from another feature. */
export interface StatusTile {
  id: string
  label: string
  state: TileState
  value: string
  detail: string
  href: string | null
}

export interface EmergencyData {
  settings: EmergencySettings
  /** The state in use: chosen, or worked out from Home. */
  state: AuState | null
  home: { lat: number; lon: number; name: string } | null
  warnings: Warning[]
  warningsAt: number | null
  warningsError: string | null
  /** Sources that couldn't be read last time. */
  failed: string[]
  board: StatusTile[]
  plan: Plan
  kit: Kit
}

/** The Emergency card on the Overview. */
export interface EmergencyStatus {
  near: number
  highest: WarningLevel | null
  weather: number
  kitHave: number
  kitTotal: number
  planDone: boolean
}
