import type { EventKind, Health, InternetSettings } from './types'

/** Plain maths and the outage detector. No I/O, so it's all unit tested. */

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[idx]!
}

/** Average absolute difference between consecutive measurements. */
export function jitter(values: readonly number[]): number | null {
  if (values.length < 2) return null
  let total = 0
  for (let i = 1; i < values.length; i++) total += Math.abs(values[i]! - values[i - 1]!)
  return total / (values.length - 1)
}

export const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10)

/** Turns connect times (null for a failed attempt) into one sample's numbers. */
export function summarise(attempts: readonly (number | null)[]): { latencyMs: number | null; jitterMs: number | null; lossPct: number } {
  const ok = attempts.filter((a): a is number => a !== null)
  const lossPct = attempts.length === 0 ? 100 : Math.round(((attempts.length - ok.length) / attempts.length) * 1000) / 10
  return { latencyMs: round1(median(ok)), jitterMs: round1(jitter(ok)), lossPct }
}

export function classify(s: { latencyMs: number | null; lossPct: number }, settings: InternetSettings): Health {
  if (s.lossPct >= 100 || s.latencyMs === null) return 'offline'
  if (s.lossPct >= settings.lossWarnPct || s.latencyMs > settings.latencyWarnMs) return 'degraded'
  return 'online'
}

/**
 * The outage detector, with hysteresis so one dropped probe doesn't page you:
 * it takes 2 offline probes in a row to call an outage, 3 bad ones to call it
 * degraded, and 2 good ones to call it over. Feed it each probe's health and
 * it says when an event starts or ends.
 */
export const ENTER_OFFLINE = 2
export const ENTER_DEGRADED = 3
export const RECOVER = 2

export interface DetectorState {
  /** The event that's open right now, if any. */
  open: { kind: Exclude<EventKind, 'slow'>; startedAt: number } | null
  /** Consecutive probes of each kind, and when the run started. */
  offlineRun: number
  offlineSince: number | null
  degradedRun: number
  degradedSince: number | null
  goodRun: number
}

export const INITIAL_DETECTOR: DetectorState = {
  open: null,
  offlineRun: 0,
  offlineSince: null,
  degradedRun: 0,
  degradedSince: null,
  goodRun: 0,
}

export type DetectorAction =
  | { type: 'open'; kind: 'outage' | 'degraded'; at: number }
  | { type: 'close'; kind: 'outage' | 'degraded'; startedAt: number; at: number }

export function step(state: DetectorState, health: Health, at: number): { state: DetectorState; actions: DetectorAction[] } {
  const s: DetectorState = { ...state }
  const actions: DetectorAction[] = []

  if (health === 'offline') {
    s.offlineSince = s.offlineRun === 0 ? at : s.offlineSince
    s.offlineRun++
  } else {
    s.offlineRun = 0
    s.offlineSince = null
  }
  // An offline probe is also "not good", so it keeps a degraded spell going.
  if (health !== 'online') {
    s.degradedSince = s.degradedRun === 0 ? at : s.degradedSince
    s.degradedRun++
    s.goodRun = 0
  } else {
    s.degradedRun = 0
    s.degradedSince = null
    s.goodRun++
  }

  const close = () => {
    if (s.open) actions.push({ type: 'close', kind: s.open.kind, startedAt: s.open.startedAt, at })
    s.open = null
  }

  if (s.offlineRun >= ENTER_OFFLINE && s.open?.kind !== 'outage') {
    // An outage replaces a degraded spell: close that one where the outage began.
    if (s.open) actions.push({ type: 'close', kind: s.open.kind, startedAt: s.open.startedAt, at: s.offlineSince! })
    s.open = { kind: 'outage', startedAt: s.offlineSince! }
    actions.push({ type: 'open', kind: 'outage', at: s.offlineSince! })
  } else if (s.degradedRun >= ENTER_DEGRADED && !s.open && health === 'degraded') {
    s.open = { kind: 'degraded', startedAt: s.degradedSince! }
    actions.push({ type: 'open', kind: 'degraded', at: s.degradedSince! })
  } else if (s.open?.kind === 'outage' && health === 'degraded' && s.offlineRun === 0) {
    // Back from an outage but still poor: end the outage, a degraded spell
    // opens once it has lasted ENTER_DEGRADED probes.
    close()
  } else if (s.goodRun >= RECOVER && s.open) {
    close()
  }
  return { state: s, actions }
}

/** Whether a speed test is far enough below normal to call "slow". */
export function isSlow(downMbps: number | null, usualDownMbps: number | null, settings: InternetSettings): boolean {
  if (downMbps === null || usualDownMbps === null || usualDownMbps <= 0) return false
  return downMbps < (usualDownMbps * settings.speedDropPct) / 100
}

/** Chart resolution per range: about 60–170 buckets each. */
export const RANGE_SPEC = {
  '1h': { spanMs: 3_600_000, bucketMs: 60_000 },
  '24h': { spanMs: 86_400_000, bucketMs: 15 * 60_000 },
  '7d': { spanMs: 7 * 86_400_000, bucketMs: 3_600_000 },
  '30d': { spanMs: 30 * 86_400_000, bucketMs: 6 * 3_600_000 },
} as const

/** Rough data use per month for a speed test schedule, in GB. */
export function monthlySpeedTestGB(settings: Pick<InternetSettings, 'speedTestEveryHours' | 'speedTestMB'>): number {
  if (settings.speedTestEveryHours <= 0) return 0
  const perTestMB = settings.speedTestMB * 1.4
  return Math.round(((perTestMB * (24 / settings.speedTestEveryHours) * 30) / 1024) * 10) / 10
}

/** Keeps settings sensible whatever the UI or an API caller sends. */
export function cleanSettings(input: Partial<InternetSettings>, base: InternetSettings): InternetSettings {
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    probeIntervalSec: Math.round(num(input.probeIntervalSec, 15, 3600, base.probeIntervalSec)),
    speedTestEveryHours: Math.round(num(input.speedTestEveryHours, 0, 168, base.speedTestEveryHours)),
    latencyWarnMs: Math.round(num(input.latencyWarnMs, 10, 5000, base.latencyWarnMs)),
    lossWarnPct: num(input.lossWarnPct, 1, 99, base.lossWarnPct),
    speedDropPct: Math.round(num(input.speedDropPct, 5, 95, base.speedDropPct)),
    speedTestMB: Math.round(num(input.speedTestMB, 5, 200, base.speedTestMB)),
    notifyOutage: bool(input.notifyOutage, base.notifyOutage),
    notifyDegraded: bool(input.notifyDegraded, base.notifyDegraded),
    notifySlow: bool(input.notifySlow, base.notifySlow),
    retentionDays: Math.round(num(input.retentionDays, 1, 365, base.retentionDays)),
  }
}
