/** Shared between the server and the UI. No Node imports. */

export type Health = 'online' | 'degraded' | 'offline'

export interface InternetCheck {
  name: string
  ok: boolean
  ms: number | null
  detail: string
}

/** One probe: a few quick connections to each target, every probe interval. */
export interface Sample {
  at: number
  health: Health
  /** Median connect time across all targets, ms. */
  latencyMs: number | null
  /** Average change between consecutive connect times, ms. */
  jitterMs: number | null
  /** Share of connections that failed, 0–100. */
  lossPct: number
  dnsMs: number | null
  checks: InternetCheck[]
}

export interface SpeedTest {
  at: number
  ok: boolean
  downMbps: number | null
  upMbps: number | null
  error: string | null
}

export type EventKind = 'outage' | 'degraded' | 'slow'

export interface NetEvent {
  id: number
  kind: EventKind
  startedAt: number
  endedAt: number | null
  detail: string
}

export interface InternetSettings {
  /** Seconds between probes. */
  probeIntervalSec: number
  /** Hours between speed tests; 0 turns them off. */
  speedTestEveryHours: number
  /** Latency above this counts as degraded, ms. */
  latencyWarnMs: number
  /** Packet loss at or above this counts as degraded, %. */
  lossWarnPct: number
  /** A speed test below this share of your usual download counts as slow, %. */
  speedDropPct: number
  /** Megabytes downloaded per speed test (upload uses about 40% of this). */
  speedTestMB: number
  notifyOutage: boolean
  notifyDegraded: boolean
  notifySlow: boolean
  /** Days of history kept. */
  retentionDays: number
}

export const DEFAULT_SETTINGS: InternetSettings = {
  probeIntervalSec: 60,
  speedTestEveryHours: 6,
  latencyWarnMs: 150,
  lossWarnPct: 5,
  speedDropPct: 50,
  speedTestMB: 25,
  notifyOutage: true,
  notifyDegraded: true,
  notifySlow: true,
  retentionDays: 30,
}

export const PROBE_INTERVALS = [30, 60, 120, 300, 600] as const
export const SPEED_TEST_SCHEDULES = [0, 1, 3, 6, 12, 24] as const
export const RANGES = ['1h', '24h', '7d', '30d'] as const
export type Range = (typeof RANGES)[number]

/** One bar or point on a chart: a summary of the samples in a time bucket. */
export interface Bucket {
  t: number
  count: number
  latencyAvg: number | null
  latencyMax: number | null
  jitterAvg: number | null
  lossAvg: number | null
  /** Samples that weren't offline, as a share, 0–100. */
  uptimePct: number | null
  /** What best describes the bucket: down or struggling for at least 20% of it, else online. */
  state: Health | null
}

export interface InternetStats {
  range: Range
  from: number
  to: number
  bucketMs: number
  buckets: Bucket[]
  uptimePct: number | null
  latencyMedian: number | null
  latencyP95: number | null
  lossAvg: number | null
  speedTests: SpeedTest[]
  /** Median download of the last 7 days' successful tests: your "usual". */
  usualDownMbps: number | null
  events: NetEvent[]
}

export interface InternetStatus {
  latest: Sample | null
  lastSpeedTest: SpeedTest | null
  openEvent: NetEvent | null
  /** Up to the last hour of latency, oldest first, for the Overview sparkline. */
  recentLatency: (number | null)[]
  uptime24hPct: number | null
  running: boolean
  speedTestRunning: boolean
  nextSpeedTestAt: number | null
}
