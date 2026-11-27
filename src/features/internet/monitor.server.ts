import type { FeatureContext } from '#/platform/server/runtime.server'
import { cleanSettings, INITIAL_DETECTOR, isSlow, RANGE_SPEC, step, type DetectorAction, type DetectorState } from './analyze'
import { probe } from './probe.server'
import { speedTest } from './speedtest.server'
import type { InternetStore } from './store.server'
import { DEFAULT_SETTINGS, type InternetSettings, type InternetStats, type InternetStatus, type Range, type Sample, type SpeedTest } from './types'

const SETTINGS_KEY = 'internet.settings'
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Wait this long after start before the first speed test, so boot isn't slowed. */
const FIRST_SPEED_TEST_DELAY = 5 * 60_000

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: process.env.TZ || undefined })
}

export function lasted(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h} h${mins % 60 ? ` ${mins % 60} min` : ''}`
}

/**
 * Runs the Internet feature: a probe every `probeIntervalSec`, a speed test
 * every `speedTestEveryHours`, and the detector that turns runs of bad probes
 * into outage and degraded events, with notifications as they start and end.
 */
export class InternetMonitor {
  private detector: DetectorState = INITIAL_DETECTOR
  private openEventId: number | null = null
  private probeTimer: ReturnType<typeof setTimeout> | null = null
  private speedTimer: ReturnType<typeof setInterval> | null = null
  private probing: Promise<Sample> | null = null
  private testing: Promise<SpeedTest> | null = null
  private startedAt = Date.now()
  private lastPrune = 0
  private stopped = true

  constructor(
    private readonly ctx: FeatureContext,
    private readonly store: InternetStore,
    private readonly probeFn: typeof probe = probe,
    private readonly speedFn: typeof speedTest = speedTest,
  ) {}

  settings(): InternetSettings {
    return cleanSettings(this.ctx.settings.getJson<Partial<InternetSettings>>(SETTINGS_KEY) ?? {}, DEFAULT_SETTINGS)
  }

  saveSettings(input: Partial<InternetSettings>): InternetSettings {
    const next = cleanSettings(input, this.settings())
    this.ctx.settings.setJson(SETTINGS_KEY, next)
    if (!this.stopped) this.scheduleProbe(next.probeIntervalSec * 1000)
    return next
  }

  start(): void {
    this.stopped = false
    this.startedAt = Date.now()
    // Pick up an event left open by a restart, so recovery still closes it.
    const open = this.store.currentEvent()
    if (open && open.kind !== 'slow') {
      this.openEventId = open.id
      this.detector = { ...INITIAL_DETECTOR, open: { kind: open.kind, startedAt: open.startedAt } }
    }
    this.scheduleProbe(2_000)
    this.speedTimer = setInterval(() => void this.speedTestIfDue(), 60_000)
    this.speedTimer.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.probeTimer) clearTimeout(this.probeTimer)
    if (this.speedTimer) clearInterval(this.speedTimer)
    this.probeTimer = this.speedTimer = null
  }

  private scheduleProbe(delayMs: number): void {
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = setTimeout(async () => {
      await this.probeNow().catch((err) => this.ctx.log('probe failed', err))
      if (!this.stopped) this.scheduleProbe(this.settings().probeIntervalSec * 1000)
    }, delayMs)
    this.probeTimer.unref?.()
  }

  /** Runs a probe now. Concurrent calls share one. */
  probeNow(): Promise<Sample> {
    this.probing ??= this.runProbe().finally(() => {
      this.probing = null
    })
    return this.probing
  }

  private async runProbe(): Promise<Sample> {
    const settings = this.settings()
    const sample = await this.probeFn(settings)
    this.store.addSample(sample)
    const { state, actions } = step(this.detector, sample.health, sample.at)
    this.detector = state
    for (const action of actions) this.handle(action, sample, settings)
    if (Date.now() - this.lastPrune > DAY) {
      this.store.prune(Date.now() - settings.retentionDays * DAY)
      this.lastPrune = Date.now()
    }
    return sample
  }

  private handle(action: DetectorAction, sample: Sample, settings: InternetSettings): void {
    if (action.type === 'open') {
      const detail =
        action.kind === 'outage'
          ? 'Cloudflare, Google and GitHub all stopped answering.'
          : `Latency ${sample.latencyMs ?? '—'} ms, ${sample.lossPct}% packet loss.`
      this.openEventId = this.store.openEvent(action.kind, action.at, detail)
      if (action.kind === 'outage' && settings.notifyOutage) {
        this.ctx.notify({
          level: 'alert',
          title: 'The internet is down',
          body: `Nothing has answered since ${clock(action.at)}. Everything in Outpost still works offline.`,
        })
      }
      if (action.kind === 'degraded' && settings.notifyDegraded) {
        this.ctx.notify({ level: 'warn', title: 'The internet is struggling', body: `${detail} Since ${clock(action.at)}.` })
      }
      return
    }
    if (this.openEventId !== null) this.store.closeEvent(this.openEventId, action.at)
    this.openEventId = null
    const notified = action.kind === 'outage' ? settings.notifyOutage : settings.notifyDegraded
    if (notified) {
      this.ctx.notify({
        level: 'info',
        title: action.kind === 'outage' ? 'The internet is back' : 'The internet is back to normal',
        body: `It was ${action.kind === 'outage' ? 'down' : 'struggling'} for ${lasted(action.at - action.startedAt)}.`,
      })
    }
  }

  nextSpeedTestAt(): number | null {
    const every = this.settings().speedTestEveryHours
    if (every <= 0) return null
    const last = this.store.lastSpeedTest()
    return last ? last.at + every * HOUR : this.startedAt + FIRST_SPEED_TEST_DELAY
  }

  private async speedTestIfDue(): Promise<void> {
    const due = this.nextSpeedTestAt()
    // Don't add a speed test to an outage; it would only fail.
    if (due === null || Date.now() < due || this.detector.open?.kind === 'outage') return
    await this.speedTestNow().catch((err) => this.ctx.log('speed test failed', err))
  }

  /** Runs a speed test now. Concurrent calls share one. */
  speedTestNow(): Promise<SpeedTest> {
    this.testing ??= this.runSpeedTest().finally(() => {
      this.testing = null
    })
    return this.testing
  }

  private async runSpeedTest(): Promise<SpeedTest> {
    const settings = this.settings()
    // "Usual" is judged before this test is added, so it can't excuse itself.
    const usual = this.store.usualDownMbps(Date.now() - 7 * DAY)
    const result = await this.speedFn(settings.speedTestMB)
    this.store.addSpeedTest(result)
    if (result.ok && isSlow(result.downMbps, usual, settings)) {
      const detail = `Download ${result.downMbps} Mbps, against your usual ${usual} Mbps.`
      this.store.openEvent('slow', result.at, detail, result.at)
      if (settings.notifySlow) this.ctx.notify({ level: 'warn', title: 'The internet is slower than usual', body: detail })
    }
    return result
  }

  status(): InternetStatus {
    const now = Date.now()
    return {
      latest: this.store.latestSample(),
      lastSpeedTest: this.store.lastSpeedTest(),
      openEvent: this.store.currentEvent(),
      recentLatency: this.store.latencySince(now - HOUR).slice(-60),
      uptime24hPct: this.store.uptimePct(now - DAY),
      running: !this.stopped,
      speedTestRunning: this.testing !== null,
      nextSpeedTestAt: this.nextSpeedTestAt(),
    }
  }

  stats(range: Range): InternetStats {
    const { spanMs, bucketMs } = RANGE_SPEC[range]
    const to = Date.now()
    const from = to - spanMs
    const lat = this.store.latencyStats(from, to)
    return {
      range,
      from,
      to,
      bucketMs,
      buckets: this.store.buckets(from, to, bucketMs),
      uptimePct: this.store.uptimePct(from, to),
      latencyMedian: lat.median,
      latencyP95: lat.p95,
      lossAvg: lat.lossAvg,
      speedTests: this.store.speedTests(range === '1h' || range === '24h' ? to - 7 * DAY : from, to),
      usualDownMbps: this.store.usualDownMbps(to - 7 * DAY),
      events: this.store.events(from, to),
    }
  }
}
