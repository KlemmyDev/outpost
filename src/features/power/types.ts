/** Shared between the Power server side and its page. No Node imports. */

export interface PowerSettings {
  /** WattsMyPower's address, e.g. http://192.168.1.40:8080 */
  url: string
  /** Notify when the grid goes down and comes back. */
  notifyGrid: boolean
  /** Notify when the battery falls to this level while off-grid (0 = never). */
  lowBatteryPct: number
}

export const DEFAULT_POWER: PowerSettings = { url: '', notifyGrid: true, lowBatteryPct: 25 }

export type PowerState = 'unconfigured' | 'connecting' | 'ok' | 'stale' | 'error'

/** Power right now, from WattsMyPower's latest reading. Watts, and percent for the battery. */
export interface PowerNow {
  at: number
  solarW: number
  homeW: number
  /** Positive is importing from the grid, negative exporting. */
  gridW: number
  /** Positive is discharging, negative charging. */
  batteryW: number
  batteryPct: number | null
  batteryTempC: number | null
  gridVoltage: number | null
  /** The inverter has lost the grid. */
  offGrid: boolean
  offGridSince: number | null
  today: { solarKwh: number; importKwh: number; exportKwh: number; chargeKwh: number; dischargeKwh: number }
}

export interface PowerSystem {
  model: string
  pvKw: number | null
  batteryKwh: number | null
  /** The level the battery stops discharging at, percent. */
  reservePct: number
  batteryMaxKw: number | null
}

export interface ForecastHour {
  t: number
  solarKw: number
  homeKw: number
  /** WattsMyPower's projected battery level, with the grid. */
  soc: number | null
  code: number | null
}

export interface ForecastDay {
  date: string
  solarKwh: number
  homeKwh: number
  minSoc: number | null
  maxSoc: number | null
  code: number | null
  tempMax: number | null
}

/** How long the battery would keep the house going without the grid. */
export interface Runtime {
  /** Usable energy above the reserve, kWh. */
  usableKwh: number
  /** At today's net draw (home minus solar right now); null while solar covers the house. */
  atThisRateH: number | null
  /** Through a usual night: no solar, the home's average draw. */
  usualNightH: number | null
  /** Hour by hour through the forecast, with its solar: when the reserve would be reached, or null if it lasts the whole forecast. */
  withForecastUntil: number | null
  /** How far the forecast reaches, so "lasts through" has an end. */
  forecastEnd: number | null
  /** The battery level that walk ends at, or its lowest point. */
  forecastLowPct: number | null
}

export interface TodayCosts {
  netCost: number
  saved: number
  homeKwh: number
}

export interface PowerData {
  state: PowerState
  error: string | null
  settings: PowerSettings
  hasKey: boolean
  /** The key's permissions, from the last ping. */
  scopes: string[]
  now: PowerNow | null
  system: PowerSystem | null
  runtime: Runtime | null
  forecast: { hours: ForecastHour[]; days: ForecastDay[]; fullAt: number | null } | null
  costs: TodayCosts | null
  lastOkAt: number | null
}

export interface HistorySeries {
  t: number[]
  solarW: (number | null)[]
  homeW: (number | null)[]
  batteryPct: (number | null)[]
  gridW: (number | null)[]
}

/** The Power card on the Overview. */
export interface PowerStatus {
  state: PowerState
  batteryPct: number | null
  solarW: number | null
  homeW: number | null
  offGrid: boolean
  runtimeH: number | null
  lastsForecast: boolean
}
