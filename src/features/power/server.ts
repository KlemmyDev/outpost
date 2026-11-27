import type { FeatureContext, FeatureServer } from '#/platform/server/runtime.server'
import { cleanUrl, parseCosts, parseForecast, parseHistory, parseLive, parseSystem, WmpClient, WmpError } from './client.server'
import { hoursLabel, runtime } from './runtime'
import { DEFAULT_POWER, type ForecastDay, type ForecastHour, type HistorySeries, type PowerData, type PowerNow, type PowerSettings, type PowerState, type PowerStatus, type PowerSystem, type TodayCosts } from './types'

const SETTINGS_KEY = 'power.settings'
/** The key is kept apart from the other settings and never sent to a page. */
const KEY_KEY = 'power.key'
const LIVE_EVERY_MS = 30_000
const SLOW_EVERY_MS = 10 * 60_000
/** A reading older than this means the inverter, or WattsMyPower, has stopped. */
const STALE_MS = 5 * 60_000

export function cleanPowerSettings(input: Partial<PowerSettings>, base: PowerSettings = DEFAULT_POWER): PowerSettings {
  const low = Number(input.lowBatteryPct ?? base.lowBatteryPct)
  return {
    url: input.url !== undefined ? cleanUrl(String(input.url)) : base.url,
    notifyGrid: typeof input.notifyGrid === 'boolean' ? input.notifyGrid : base.notifyGrid,
    lowBatteryPct: Number.isFinite(low) ? Math.min(90, Math.max(0, Math.round(low))) : base.lowBatteryPct,
  }
}

/**
 * Follows a WattsMyPower server: the live reading every 30 seconds, the
 * system, forecast and today's costs every 10 minutes. Works out the
 * off-grid runtime, and notifies when the grid goes down or comes back and
 * when the battery runs low without it.
 */
export class PowerService {
  private state: PowerState = 'unconfigured'
  private error: string | null = null
  private scopes: string[] = []
  private now: PowerNow | null = null
  private system: PowerSystem | null = null
  private forecast: { hours: ForecastHour[]; days: ForecastDay[]; fullAt: number | null; averageHomeKw: number | null } | null = null
  private costs: TodayCosts | null = null
  private lastOkAt: number | null = null
  private lastSlowAt = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private wasOffGrid: boolean | null = null
  private lowNotified = false
  private historyCache = new Map<string, { at: number; value: HistorySeries }>()

  constructor(
    private readonly ctx: FeatureContext,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  settings(): PowerSettings {
    return cleanPowerSettings(this.ctx.settings.getJson<Partial<PowerSettings>>(SETTINGS_KEY) ?? {}, DEFAULT_POWER)
  }

  private key(): string {
    return this.ctx.settings.get(KEY_KEY) ?? ''
  }

  private client(): WmpClient | null {
    const s = this.settings()
    const key = this.key()
    return s.url && key ? new WmpClient(s.url, key, this.fetchImpl) : null
  }

  /** Saves the address, settings and (if given) a new key, after checking they work. */
  async save(input: Partial<PowerSettings> & { key?: string }): Promise<PowerData> {
    const next = cleanPowerSettings(input, this.settings())
    const key = input.key?.trim() ? input.key.trim() : this.key()
    if (input.key?.trim() && !/^wmp_[\w-]{10,}$/.test(key)) throw new WmpError('WattsMyPower keys start with wmp_. Copy the whole key from its Settings › Developers.')
    if (next.url && key) {
      const { scopes } = await new WmpClient(next.url, key, this.fetchImpl).ping()
      if (!scopes.includes('live:read')) throw new WmpError('That key works, but can’t read live power. Make one with "live" switched on.')
      this.scopes = scopes
    }
    this.ctx.settings.setJson(SETTINGS_KEY, next)
    if (input.key?.trim()) this.ctx.settings.set(KEY_KEY, key)
    this.lastSlowAt = 0
    this.historyCache.clear()
    await this.poll()
    return this.data()
  }

  forget(): void {
    this.ctx.settings.delete(KEY_KEY)
    this.ctx.settings.setJson(SETTINGS_KEY, { ...this.settings(), url: '' })
    this.now = this.system = this.forecast = this.costs = null
    this.state = 'unconfigured'
  }

  start(): void {
    void this.poll()
    this.timer = setInterval(() => void this.poll(), LIVE_EVERY_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async poll(): Promise<void> {
    if (this.busy) return
    const client = this.client()
    if (!client) {
      this.state = 'unconfigured'
      return
    }
    this.busy = true
    if (this.state === 'unconfigured') this.state = 'connecting'
    try {
      const live = await client.get('live')
      this.now = parseLive(live)
      if (Date.now() - this.lastSlowAt > SLOW_EVERY_MS || !this.system) {
        this.lastSlowAt = Date.now()
        const [sys, fc, today, ping] = await Promise.allSettled([client.get('system'), client.get('forecast', 20_000), client.get('today'), client.ping()])
        if (sys.status === 'fulfilled') this.system = parseSystem(sys.value, live)
        else if (!this.system) this.system = parseSystem({}, live)
        if (fc.status === 'fulfilled') this.forecast = parseForecast(fc.value)
        if (today.status === 'fulfilled') this.costs = parseCosts(today.value)
        if (ping.status === 'fulfilled') this.scopes = ping.value.scopes
      }
      this.lastOkAt = Date.now()
      this.error = null
      this.state = Date.now() - this.now.at > STALE_MS ? 'stale' : 'ok'
      this.watch()
    } catch (err) {
      this.state = 'error'
      this.error = (err as Error).message
    } finally {
      this.busy = false
    }
  }

  /** Notifications on the edges: grid lost and back, battery low without it. */
  private watch(): void {
    const now = this.now
    if (!now) return
    const s = this.settings()
    const rt = this.runtime()
    if (this.wasOffGrid !== null && now.offGrid !== this.wasOffGrid && s.notifyGrid) {
      if (now.offGrid) {
        const left = rt?.withForecastUntil ? `The battery should last until ${clock(rt.withForecastUntil)}.` : rt?.forecastEnd ? 'With the forecast solar, the battery should last through the next two days.' : rt?.atThisRateH ? `About ${hoursLabel(rt.atThisRateH)} at this rate.` : ''
        this.ctx.notify({ level: 'alert', title: 'The grid is down', body: `The house is running on the battery${now.batteryPct !== null ? ` (${Math.round(now.batteryPct)}%)` : ''}. ${left}`.trim() })
      } else {
        this.ctx.notify({ level: 'info', title: 'The grid is back', body: now.batteryPct !== null ? `The battery is at ${Math.round(now.batteryPct)}%.` : '' })
      }
    }
    this.wasOffGrid = now.offGrid
    if (!now.offGrid || now.batteryPct === null || !s.lowBatteryPct) {
      this.lowNotified = false
      return
    }
    if (now.batteryPct <= s.lowBatteryPct && !this.lowNotified) {
      this.lowNotified = true
      this.ctx.notify({ level: 'alert', title: `Battery at ${Math.round(now.batteryPct)}% with no grid`, body: rt?.atThisRateH ? `About ${hoursLabel(rt.atThisRateH)} left at this rate. Turning off big loads will stretch it.` : 'Turning off big loads will stretch it.' })
    } else if (now.batteryPct > s.lowBatteryPct + 5) {
      this.lowNotified = false
    }
  }

  private runtime() {
    if (!this.now || !this.system) return null
    return runtime(this.now, this.system, this.forecast?.hours ?? [], this.forecast?.averageHomeKw ?? null)
  }

  async history(range: '24h' | '7d'): Promise<HistorySeries> {
    const client = this.client()
    if (!client) throw new WmpError('Connect WattsMyPower first.')
    const hit = this.historyCache.get(range)
    if (hit && Date.now() - hit.at < 60_000) return hit.value
    const end = Math.floor(Date.now() / 1000)
    const start = end - (range === '24h' ? 86_400 : 7 * 86_400)
    const value = parseHistory(await client.get(`history?start=${start}&end=${end}&points=${range === '24h' ? 288 : 336}&fields=pv_power,load_power,grid_power,battery_soc`, 20_000))
    this.historyCache.set(range, { at: Date.now(), value })
    return value
  }

  data(): PowerData {
    const fc = this.forecast
    return {
      state: this.state,
      error: this.error,
      settings: this.settings(),
      hasKey: !!this.key(),
      scopes: this.scopes,
      now: this.now,
      system: this.system,
      runtime: this.runtime(),
      forecast: fc ? { hours: fc.hours.filter((h) => h.t + 3_600_000 > Date.now()).slice(0, 48), days: fc.days, fullAt: fc.fullAt } : null,
      costs: this.costs,
      lastOkAt: this.lastOkAt,
    }
  }

  widget(): PowerStatus {
    const rt = this.runtime()
    return {
      state: this.state,
      batteryPct: this.now?.batteryPct ?? null,
      solarW: this.now?.solarW ?? null,
      homeW: this.now?.homeW ?? null,
      offGrid: this.now?.offGrid ?? false,
      runtimeH: rt?.withForecastUntil ? (rt.withForecastUntil - Date.now()) / 3_600_000 : (rt?.atThisRateH ?? rt?.usualNightH ?? null),
      lastsForecast: !!rt?.forecastEnd,
    }
  }
}

function clock(t: number): string {
  return new Date(t).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

let service: PowerService | null = null

export function getPower(): PowerService | null {
  return service
}

export const server: FeatureServer = {
  start(ctx) {
    service = new PowerService(ctx)
    service.start()
  },
  stop() {
    service?.stop()
    service = null
  },
}
