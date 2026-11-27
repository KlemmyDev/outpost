import type { FeatureContext, FeatureServer } from '#/platform/server/runtime.server'
import { getPlatform } from '#/platform/server/platform.server'
import { getMonitor } from '#/features/internet/server'
import { getLibrary } from '#/features/library/server'
import { getMap } from '#/features/map/server'
import { getMessages } from '#/features/messages/server'
import { getPower } from '#/features/power/server'
import { hoursLabel } from '#/features/power/runtime'
import { FIRST_AID_GUIDES } from '#/features/first-aid/topics'
import { defaultKit, expiringSoon } from './kit'
import { DEFAULT_EMERGENCY, EMPTY_PLAN, STATES, type AuState, type EmergencyData, type EmergencySettings, type EmergencyStatus, type Kit, type KitItem, type Plan, type StatusTile, type Warning } from './types'
import { arrange, BOM_FEEDS, FIRE_FEEDS, LEVEL_RANK, parseBom, severeWeather, stateAt } from './warnings.server'

const KEYS = { settings: 'emergency.settings', plan: 'emergency.plan', kit: 'emergency.kit', seen: 'emergency.seen' } as const
const POLL_MS = 10 * 60_000
const UA = 'Mozilla/5.0 (compatible; Outpost offline library)'

export function cleanEmergencySettings(input: Partial<EmergencySettings>, base: EmergencySettings = DEFAULT_EMERGENCY): EmergencySettings {
  const radius = Number(input.radiusKm ?? base.radiusKm)
  const state = input.state === null ? null : (STATES as readonly string[]).includes(String(input.state)) ? (input.state as AuState) : base.state
  return {
    state,
    radiusKm: Number.isFinite(radius) ? Math.min(500, Math.max(5, Math.round(radius))) : base.radiusKm,
    notifyAdvice: typeof input.notifyAdvice === 'boolean' ? input.notifyAdvice : base.notifyAdvice,
    notifyWeather: typeof input.notifyWeather === 'boolean' ? input.notifyWeather : base.notifyWeather,
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export function cleanPlan(p: Partial<Plan>): Plan {
  const people = Array.isArray(p.people)
    ? p.people.slice(0, 40).map((x, i) => ({
        id: str(x?.id, 40) || `p${Date.now().toString(36)}${i}`,
        name: str(x?.name, 80).trim(),
        phone: str(x?.phone, 40).trim(),
        role: str(x?.role, 60).trim(),
        medical: str(x?.medical, 1000),
      }))
    : []
  return {
    people: people.filter((x) => x.name || x.phone),
    meetNear: str(p.meetNear, 500),
    meetAway: str(p.meetAway, 500),
    power: str(p.power, 500),
    gas: str(p.gas, 500),
    water: str(p.water, 500),
    pets: str(p.pets, 1000),
    insurance: str(p.insurance, 1000),
    notes: str(p.notes, 4000),
    updatedAt: Date.now(),
  }
}

export function cleanKit(items: Partial<KitItem>[]): KitItem[] {
  return items.slice(0, 80).flatMap((x, i) => {
    const name = str(x?.name, 80).trim()
    if (!name) return []
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(String(x?.expires ?? '')) ? String(x!.expires) : null
    return [{ id: str(x?.id, 40) || `k${Date.now().toString(36)}${i}`, name, hint: str(x?.hint, 300), have: x?.have === true, expires, custom: x?.custom === true }]
  })
}

/**
 * Emergency: official warnings near home (polled every 10 minutes while
 * there's internet, kept for when there isn't), a status board drawn from the
 * other features, the household's plan and its emergency kit. Notifies for
 * new warnings close by, severe weather, and kit items about to expire.
 */
export class EmergencyService {
  private warnings: Warning[] = []
  private warningsAt: number | null = null
  private error: string | null = null
  private failed: string[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private first = true
  /** The state and home the last check used; when either moves, the next check starts quiet again. */
  private lastArea = ''

  constructor(
    private readonly ctx: FeatureContext,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  settings(): EmergencySettings {
    return cleanEmergencySettings(this.ctx.settings.getJson<Partial<EmergencySettings>>(KEYS.settings) ?? {})
  }

  saveSettings(input: Partial<EmergencySettings>): EmergencySettings {
    const next = cleanEmergencySettings(input, this.settings())
    this.ctx.settings.setJson(KEYS.settings, next)
    void this.poll()
    return next
  }

  plan(): Plan {
    return { ...EMPTY_PLAN, ...(this.ctx.settings.getJson<Plan>(KEYS.plan) ?? {}) }
  }

  savePlan(p: Partial<Plan>): Plan {
    const next = cleanPlan(p)
    this.ctx.settings.setJson(KEYS.plan, next)
    return next
  }

  kit(): Kit {
    const saved = this.ctx.settings.getJson<Kit>(KEYS.kit)
    return saved?.items?.length ? saved : { items: defaultKit(), checkedAt: null }
  }

  saveKit(items: Partial<KitItem>[]): Kit {
    const next = { items: cleanKit(items), checkedAt: Date.now() }
    this.ctx.settings.setJson(KEYS.kit, next)
    return next
  }

  home(): { lat: number; lon: number; name: string } | null {
    const h = getMap()?.store.waypoints().find((w) => w.kind === 'home')
    return h ? { lat: h.lat, lon: h.lon, name: h.name } : null
  }

  state(): AuState | null {
    const s = this.settings().state
    if (s) return s
    const h = this.home()
    return h ? stateAt(h.lat, h.lon) : null
  }

  start(): void {
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async get(url: string): Promise<Response> {
    return this.fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  }

  async poll(): Promise<void> {
    if (this.polling) return
    const state = this.state()
    if (!state) {
      this.error = 'Set Home on the Map, or choose your state, to follow warnings.'
      return
    }
    this.polling = true
    const home = this.home()
    const area = `${state}|${home ? `${home.lat.toFixed(2)},${home.lon.toFixed(2)}` : ''}|${this.settings().radiusKm}`
    // Warnings already out in a newly chosen area aren't news; don't announce them all.
    if (area !== this.lastArea) this.first = true
    this.lastArea = area
    const failed: string[] = []
    const all: Warning[] = []
    try {
      const jobs: Promise<void>[] = [
        this.get(BOM_FEEDS[state])
          .then(async (r) => {
            if (!r.ok) throw new Error(String(r.status))
            all.push(...parseBom(await r.text()))
          })
          .catch(() => void failed.push('Bureau of Meteorology')),
      ]
      const fire = FIRE_FEEDS[state]
      if (fire) {
        jobs.push(
          this.get(fire.url)
            .then(async (r) => {
              if (!r.ok) throw new Error(String(r.status))
              all.push(...fire.parse(await r.json()))
            })
            .catch(() => void failed.push(fire.source)),
        )
      }
      await Promise.all(jobs)
      const settings = this.settings()
      const total = 1 + (fire ? 1 : 0)
      if (failed.length === total) {
        // Keep the last warnings: offline is exactly when they're wanted.
        this.error = this.warningsAt ? "Couldn't check for new warnings. These are from the last check." : "Couldn't reach the warning services. They need the internet."
      } else {
        this.warnings = arrange(all, this.home(), settings.radiusKm)
        this.warningsAt = Date.now()
        this.error = null
        this.alert(settings)
      }
      this.failed = failed
      this.checkKit()
    } finally {
      this.polling = false
      this.first = false
    }
  }

  private seen(): Set<string> {
    return new Set(this.ctx.settings.getJson<string[]>(KEYS.seen) ?? [])
  }

  private remember(ids: Set<string>): void {
    this.ctx.settings.setJson(KEYS.seen, [...ids].slice(-600))
  }

  private alert(s: EmergencySettings): void {
    const seen = this.seen()
    const fresh = this.warnings.filter((w) => !seen.has(w.id))
    for (const w of fresh) {
      seen.add(w.id)
      // On the very first check, only an Emergency Warning interrupts; the rest are just shown.
      if (this.first && w.level !== 'Emergency Warning') continue
      const where = w.distanceKm !== null ? ` ${Math.round(w.distanceKm)} km from home.` : ''
      if (w.level === 'Emergency Warning' || w.level === 'Watch and Act') {
        this.ctx.notify({ level: 'alert', title: `${w.level}: ${w.title}`, body: `${w.action ? `${w.action}.` : ''}${where} ${w.source}.`.trim() })
      } else if (w.level === 'Advice' && s.notifyAdvice) {
        this.ctx.notify({ level: 'warn', title: `Advice: ${w.title}`, body: `${where} ${w.source}.`.trim() })
      } else if (w.level === 'Weather' && s.notifyWeather && severeWeather(w)) {
        this.ctx.notify({ level: 'warn', title: w.title, body: 'From the Bureau of Meteorology.' })
      }
    }
    this.remember(seen)
  }

  /** Once a day at most: kit items about to expire, each once per date. */
  private checkKit(): void {
    const seen = this.seen()
    const soon = this.kit().items.filter((i) => i.have && expiringSoon(i))
    const fresh = soon.filter((i) => !seen.has(`kit:${i.id}:${i.expires}`))
    if (!fresh.length) return
    for (const i of fresh) seen.add(`kit:${i.id}:${i.expires}`)
    this.remember(seen)
    this.ctx.notify({ level: 'info', title: `Emergency kit: ${fresh.length === 1 ? `${fresh[0]!.name} expires soon` : `${fresh.length} things expire soon`}`, body: fresh.map((i) => `${i.name} (${i.expires})`).join(', ') })
  }

  /** What the rest of Outpost says, as one board. */
  board(): StatusTile[] {
    const features = getPlatform().features
    const on = (id: string) => features.isEnabled(id)
    const tiles: StatusTile[] = []

    if (on('internet')) {
      const s = getMonitor()?.status()
      const h = s?.latest?.health
      tiles.push({
        id: 'internet',
        label: 'Internet',
        state: !h ? 'off' : h === 'online' ? 'good' : h === 'degraded' ? 'warn' : 'bad',
        value: !h ? 'Checking' : h === 'online' ? 'Online' : h === 'degraded' ? 'Struggling' : 'Down',
        detail: h === 'offline' ? 'Phone apps and websites won’t work. Outpost still does.' : s?.latest?.latencyMs ? `${Math.round(s.latest.latencyMs)} ms` : '',
        href: '/internet',
      })
    }
    if (on('power')) {
      const p = getPower()?.widget()
      const ok = p && (p.state === 'ok' || p.state === 'stale')
      tiles.push({
        id: 'power',
        label: 'Power',
        state: !ok ? 'off' : p.offGrid ? 'bad' : 'good',
        value: !p || p.state === 'unconfigured' ? 'Not set up' : !ok ? 'No reading' : p.offGrid ? 'Grid down' : 'On the grid',
        detail: ok && p.batteryPct !== null ? `Battery ${Math.round(p.batteryPct)}%${p.lastsForecast ? ', lasts 2+ days off-grid' : p.runtimeH !== null ? `, ${hoursLabel(p.runtimeH)} off-grid` : ''}` : '',
        href: '/power',
      })
    }
    if (on('messages')) {
      const m = getMessages()?.widget()
      tiles.push({
        id: 'radio',
        label: 'Radio',
        state: !m || m.state === 'off' ? 'off' : m.state === 'connected' ? 'good' : m.state === 'error' ? 'bad' : 'warn',
        value: !m || m.state === 'off' ? 'Not set up' : m.state === 'connected' ? 'On air' : m.state === 'error' ? 'Offline' : 'Connecting',
        detail: m && m.state === 'connected' ? `${m.contacts} radio${m.contacts === 1 ? '' : 's'} heard` : 'Texts with no phone network',
        href: '/messages',
      })
    }
    const library = getLibrary()
    if (on('first-aid') && library) {
      const saved = library.guides.list().guides.filter((g) => FIRST_AID_GUIDES.includes(g.id) && g.bytes !== null).length
      tiles.push({
        id: 'first-aid',
        label: 'First aid guides',
        state: saved === FIRST_AID_GUIDES.length ? 'good' : 'warn',
        value: saved === FIRST_AID_GUIDES.length ? 'Saved' : `${saved} of ${FIRST_AID_GUIDES.length}`,
        detail: saved === FIRST_AID_GUIDES.length ? 'Readable offline' : 'Save them while the internet’s up',
        href: '/first-aid',
      })
    }
    if (on('map')) {
      const home = this.home()
      tiles.push({
        id: 'map',
        label: 'Home on the map',
        state: home ? 'good' : 'warn',
        value: home ? home.name : 'Not set',
        detail: home ? 'Warnings are measured from here' : 'Set it to see how close warnings are',
        href: '/map',
      })
    }
    const kit = this.kit()
    const have = kit.items.filter((i) => i.have).length
    const soon = kit.items.filter((i) => i.have && expiringSoon(i)).length
    tiles.push({
      id: 'kit',
      label: 'Emergency kit',
      state: have === kit.items.length && !soon ? 'good' : have >= kit.items.length / 2 ? 'warn' : 'bad',
      value: `${have} of ${kit.items.length}`,
      detail: soon ? `${soon} expiring soon` : kit.checkedAt ? 'Packed and checked' : 'Not checked yet',
      href: '/emergency?tab=kit',
    })
    return tiles
  }

  data(): EmergencyData {
    return {
      settings: this.settings(),
      state: this.state(),
      home: this.home(),
      warnings: this.warnings,
      warningsAt: this.warningsAt,
      warningsError: this.error,
      failed: this.failed,
      board: this.board(),
      plan: this.plan(),
      kit: this.kit(),
    }
  }

  widget(): EmergencyStatus {
    const near = this.warnings.filter((w) => w.level !== 'Weather')
    const kit = this.kit()
    const plan = this.plan()
    return {
      near: near.length,
      highest: near.length ? near.reduce((a, b) => (LEVEL_RANK[b.level] < LEVEL_RANK[a.level] ? b : a)).level : null,
      weather: this.warnings.filter((w) => w.level === 'Weather').length,
      kitHave: kit.items.filter((i) => i.have).length,
      kitTotal: kit.items.length,
      planDone: plan.people.length > 0 && !!(plan.meetNear || plan.meetAway),
    }
  }
}

let service: EmergencyService | null = null

export function getEmergency(): EmergencyService | null {
  return service
}

export const server: FeatureServer = {
  start(ctx) {
    service = new EmergencyService(ctx)
    service.start()
  },
  stop() {
    service?.stop()
    service = null
  },
}
