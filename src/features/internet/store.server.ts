import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '#/platform/server/db.server'
import { median, percentile } from './analyze'
import type { Bucket, EventKind, Health, InternetCheck, NetEvent, Sample, SpeedTest } from './types'

/** The Internet feature's own tables, migrated in the "internet" namespace. */
export const MIGRATIONS: Migration[] = [
  `CREATE TABLE internet_samples (
     at         INTEGER PRIMARY KEY,
     health     TEXT NOT NULL,
     latency_ms REAL,
     jitter_ms  REAL,
     loss_pct   REAL NOT NULL,
     dns_ms     REAL,
     checks     TEXT NOT NULL DEFAULT '[]'
   )`,
  `CREATE TABLE internet_speedtests (
     at        INTEGER PRIMARY KEY,
     ok        INTEGER NOT NULL,
     down_mbps REAL,
     up_mbps   REAL,
     error     TEXT
   )`,
  `CREATE TABLE internet_events (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     kind       TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at   INTEGER,
     detail     TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX internet_events_started ON internet_events (started_at)`,
]

interface SampleRow {
  at: number
  health: Health
  latency_ms: number | null
  jitter_ms: number | null
  loss_pct: number
  dns_ms: number | null
  checks: string
}
interface SpeedRow {
  at: number
  ok: number
  down_mbps: number | null
  up_mbps: number | null
  error: string | null
}
interface EventRow {
  id: number
  kind: EventKind
  started_at: number
  ended_at: number | null
  detail: string
}

const toSample = (r: SampleRow): Sample => ({
  at: r.at,
  health: r.health,
  latencyMs: r.latency_ms,
  jitterMs: r.jitter_ms,
  lossPct: r.loss_pct,
  dnsMs: r.dns_ms,
  checks: JSON.parse(r.checks) as InternetCheck[],
})
const toSpeed = (r: SpeedRow): SpeedTest => ({ at: r.at, ok: r.ok === 1, downMbps: r.down_mbps, upMbps: r.up_mbps, error: r.error })
const toEvent = (r: EventRow): NetEvent => ({ id: r.id, kind: r.kind, startedAt: r.started_at, endedAt: r.ended_at, detail: r.detail })

/** A bucket is "down" or "struggling" only if that lasted at least this share of it. */
export const BUCKET_SHARE = 0.2

/** What best describes a time bucket, so one lost packet doesn't paint an hour orange. */
export function bucketState(count: number, offline: number, degraded: number): Health | null {
  if (count === 0) return null
  if (offline / count >= BUCKET_SHARE) return 'offline'
  if ((offline + degraded) / count >= BUCKET_SHARE) return 'degraded'
  return 'online'
}

export class InternetStore {
  constructor(private readonly db: DatabaseSync) {}

  addSample(s: Sample): void {
    this.db
      .prepare('INSERT OR REPLACE INTO internet_samples (at, health, latency_ms, jitter_ms, loss_pct, dns_ms, checks) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(s.at, s.health, s.latencyMs, s.jitterMs, s.lossPct, s.dnsMs, JSON.stringify(s.checks))
  }

  latestSample(): Sample | null {
    const row = this.db.prepare('SELECT * FROM internet_samples ORDER BY at DESC LIMIT 1').get() as SampleRow | undefined
    return row ? toSample(row) : null
  }

  latencySince(from: number): (number | null)[] {
    const rows = this.db.prepare('SELECT latency_ms FROM internet_samples WHERE at >= ? ORDER BY at').all(from) as { latency_ms: number | null }[]
    return rows.map((r) => r.latency_ms)
  }

  uptimePct(from: number, to = Date.now()): number | null {
    const row = this.db
      .prepare("SELECT count(*) AS n, sum(health != 'offline') AS up FROM internet_samples WHERE at >= ? AND at < ?")
      .get(from, to) as { n: number; up: number | null }
    return row.n === 0 ? null : Math.round(((row.up ?? 0) / row.n) * 10000) / 100
  }

  /** Summaries per time bucket, with empty buckets filled in so gaps show as gaps. */
  buckets(from: number, to: number, bucketMs: number): Bucket[] {
    const rows = this.db
      .prepare(
        // node:sqlite binds JS numbers as REAL, which would make this a
        // fractional division; CAST keeps the bucket start a whole number.
        `SELECT (at / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS t, count(*) AS n,
                avg(latency_ms) AS lat_avg, max(latency_ms) AS lat_max,
                avg(jitter_ms) AS jit_avg, avg(loss_pct) AS loss_avg,
                100.0 * sum(health != 'offline') / count(*) AS up,
                sum(health = 'offline') AS off, sum(health = 'degraded') AS deg
           FROM internet_samples WHERE at >= ? AND at < ?
          GROUP BY t ORDER BY t`,
      )
      .all(bucketMs, bucketMs, from, to) as {
      t: number
      n: number
      lat_avg: number | null
      lat_max: number | null
      jit_avg: number | null
      loss_avg: number | null
      up: number
      off: number
      deg: number
    }[]
    const byT = new Map(rows.map((r) => [r.t, r]))
    const out: Bucket[] = []
    for (let t = Math.floor(from / bucketMs) * bucketMs; t < to; t += bucketMs) {
      const r = byT.get(t)
      const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)
      out.push(
        r
          ? {
              t,
              count: r.n,
              latencyAvg: r1(r.lat_avg),
              latencyMax: r1(r.lat_max),
              jitterAvg: r1(r.jit_avg),
              lossAvg: r1(r.loss_avg),
              uptimePct: r1(r.up),
              state: bucketState(r.n, r.off, r.deg),
            }
          : { t, count: 0, latencyAvg: null, latencyMax: null, jitterAvg: null, lossAvg: null, uptimePct: null, state: null },
      )
    }
    return out
  }

  latencyStats(from: number, to: number): { median: number | null; p95: number | null; lossAvg: number | null } {
    const lat = (this.db.prepare('SELECT latency_ms AS v FROM internet_samples WHERE at >= ? AND at < ? AND latency_ms IS NOT NULL').all(from, to) as { v: number }[]).map(
      (r) => r.v,
    )
    const loss = this.db.prepare('SELECT avg(loss_pct) AS v FROM internet_samples WHERE at >= ? AND at < ?').get(from, to) as { v: number | null }
    const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)
    return { median: r1(median(lat)), p95: r1(percentile(lat, 95)), lossAvg: r1(loss.v) }
  }

  addSpeedTest(s: SpeedTest): void {
    this.db
      .prepare('INSERT OR REPLACE INTO internet_speedtests (at, ok, down_mbps, up_mbps, error) VALUES (?, ?, ?, ?, ?)')
      .run(s.at, s.ok ? 1 : 0, s.downMbps, s.upMbps, s.error)
  }

  speedTests(from: number, to = Date.now()): SpeedTest[] {
    return (this.db.prepare('SELECT * FROM internet_speedtests WHERE at >= ? AND at < ? ORDER BY at').all(from, to) as unknown as SpeedRow[]).map(toSpeed)
  }

  lastSpeedTest(): SpeedTest | null {
    const row = this.db.prepare('SELECT * FROM internet_speedtests ORDER BY at DESC LIMIT 1').get() as SpeedRow | undefined
    return row ? toSpeed(row) : null
  }

  /** Median download of successful tests since `from`, if there are at least 3. */
  usualDownMbps(from: number): number | null {
    const rows = this.db.prepare('SELECT down_mbps AS v FROM internet_speedtests WHERE at >= ? AND ok = 1 AND down_mbps IS NOT NULL').all(from) as { v: number }[]
    return rows.length >= 3 ? median(rows.map((r) => r.v)) : null
  }

  openEvent(kind: EventKind, startedAt: number, detail: string, endedAt: number | null = null): number {
    const r = this.db.prepare('INSERT INTO internet_events (kind, started_at, ended_at, detail) VALUES (?, ?, ?, ?)').run(kind, startedAt, endedAt, detail)
    return Number(r.lastInsertRowid)
  }

  closeEvent(id: number, endedAt: number): void {
    this.db.prepare('UPDATE internet_events SET ended_at = ? WHERE id = ?').run(endedAt, id)
  }

  currentEvent(): NetEvent | null {
    const row = this.db.prepare('SELECT * FROM internet_events WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get() as EventRow | undefined
    return row ? toEvent(row) : null
  }

  events(from: number, to: number, limit = 100): NetEvent[] {
    return (
      this.db
        .prepare('SELECT * FROM internet_events WHERE started_at < ? AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at DESC LIMIT ?')
        .all(to, from, limit) as unknown as EventRow[]
    ).map(toEvent)
  }

  /** Deletes history older than `before`. Open events are kept. */
  prune(before: number): void {
    this.db.prepare('DELETE FROM internet_samples WHERE at < ?').run(before)
    this.db.prepare('DELETE FROM internet_speedtests WHERE at < ?').run(before)
    this.db.prepare('DELETE FROM internet_events WHERE ended_at IS NOT NULL AND ended_at < ?').run(before)
  }
}
