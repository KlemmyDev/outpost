import type { ForecastDay, ForecastHour, HistorySeries, PowerNow, PowerSystem, TodayCosts } from './types'

/**
 * Reads WattsMyPower's developer API (/api/v1) with a read-only key. See
 * docs/developers.md in WattsMyPower. Times there are unix seconds; here,
 * milliseconds.
 */

export class WmpError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message)
  }
}

type Json = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const n0 = (v: unknown): number => num(v) ?? 0

export function parseLive(d: Json): PowerNow {
  const s = (d.snapshot ?? {}) as Json
  const ts = num(s.ts) ?? num(d.last_success) ?? Date.now() / 1000
  return {
    at: Math.round(ts * 1000),
    solarW: n0(s.pv_power),
    homeW: n0(s.load_power),
    gridW: n0(s.grid_power),
    batteryW: n0(s.battery_power),
    batteryPct: num(s.battery_soc),
    batteryTempC: num(s.battery_temp),
    gridVoltage: num(s.grid_voltage),
    offGrid: d.off_grid === true,
    offGridSince: num(d.off_grid_since) === null ? null : Math.round(num(d.off_grid_since)! * 1000),
    today: {
      solarKwh: n0(s.daily_pv),
      importKwh: n0(s.daily_import),
      exportKwh: n0(s.daily_export),
      chargeKwh: n0(s.daily_charge),
      dischargeKwh: n0(s.daily_discharge),
    },
  }
}

export function parseSystem(d: Json, live?: Json): PowerSystem {
  const s = (d.system ?? {}) as Json
  const mode = (live?.battery_mode ?? {}) as Json
  return {
    model: typeof s.model === 'string' ? s.model : 'Inverter',
    pvKw: num(s.pv_kw),
    batteryKwh: num(s.battery_kwh),
    reservePct: num(s.battery_reserve) ?? num(mode.min_soc) ?? 10,
    batteryMaxKw: num(s.battery_max_kw),
  }
}

export function parseForecast(d: Json): { hours: ForecastHour[]; days: ForecastDay[]; fullAt: number | null; averageHomeKw: number | null } {
  const hours = (Array.isArray(d.hours) ? d.hours : []).map((h: Json) => ({
    t: n0(h.ts) * 1000,
    solarKw: n0(h.pv_kw),
    homeKw: n0(h.load_kw),
    soc: num(h.soc),
    code: num(h.code),
  }))
  const days = (Array.isArray(d.days) ? d.days : []).map((x: Json) => ({
    date: String(x.date ?? ''),
    solarKwh: n0(x.pv_kwh),
    homeKwh: n0(x.load_kwh),
    minSoc: num(x.min_soc),
    maxSoc: num(x.max_soc),
    code: num(x.code),
    tempMax: num(x.temp_max),
  }))
  const summary = (d.summary ?? {}) as Json
  const basis = ((d.load_basis ?? {}) as Json).days
  const daily = Array.isArray(basis) ? basis.map((b: Json) => num(b.kwh)).filter((v): v is number => v !== null) : []
  return {
    hours,
    days,
    fullAt: num(summary.full_at) === null ? null : num(summary.full_at)! * 1000,
    averageHomeKw: daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length / 24 : null,
  }
}

export function parseCosts(d: Json): TodayCosts | null {
  const c = d.costs as Json | null | undefined
  if (!c) return null
  return { netCost: n0(c.net_cost), saved: n0(c.saved), homeKwh: n0(c.home_kwh) }
}

export function parseHistory(d: Json): HistorySeries {
  const s = (d.series ?? {}) as Record<string, unknown[]>
  const arr = (k: string) => (Array.isArray(s[k]) ? s[k]!.map((v) => num(v)) : [])
  return {
    t: (Array.isArray(s.t) ? s.t : []).map((v) => n0(v) * 1000),
    solarW: arr('pv_power'),
    homeW: arr('load_power'),
    batteryPct: arr('battery_soc'),
    gridW: arr('grid_power'),
  }
}

/** Checks an address before anything is sent to it. */
export function cleanUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new WmpError('The address has to start with http:// or https://.')
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`)
  } catch {
    throw new WmpError("That doesn't look like an address. Try something like http://192.168.1.40:8080.")
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new WmpError('The address has to start with http:// or https://.')
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
}

export class WmpClient {
  constructor(
    private readonly base: string,
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get(path: string, timeoutMs = 10_000): Promise<Json> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}/api/v1/${path}`, { headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      throw new WmpError(`Couldn't reach WattsMyPower at ${this.base}.`)
    }
    if (res.status === 401) throw new WmpError("WattsMyPower didn't accept the key. Make a new one in its Settings › Developers.", 401)
    if (res.status === 403) throw new WmpError("The key can't read this. In WattsMyPower, make a key with live, history and forecast switched on.", 403)
    if (res.status === 404) throw new WmpError("That address answered, but it isn't a WattsMyPower with API keys. It needs version 2026.11.2 or later.", 404)
    if (!res.ok) throw new WmpError(`WattsMyPower answered ${res.status}.`, res.status)
    try {
      return (await res.json()) as Json
    } catch {
      throw new WmpError("WattsMyPower's answer couldn't be read.")
    }
  }

  async ping(): Promise<{ scopes: string[]; fresh: boolean }> {
    const d = await this.get('ping', 6000)
    if (d.app !== 'WattsMyPower') throw new WmpError("That address answered, but it isn't WattsMyPower.")
    const key = (d.key ?? {}) as Json
    return { scopes: Array.isArray(key.scopes) ? key.scopes.filter((s): s is string => typeof s === 'string') : [], fresh: d.inverter_fresh === true }
  }
}
