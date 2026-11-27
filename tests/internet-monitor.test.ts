import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternetMonitor, lasted } from '#/features/internet/monitor.server'
import { bucketState, InternetStore, MIGRATIONS } from '#/features/internet/store.server'
import type { Health, Sample, SpeedTest } from '#/features/internet/types'
import { migrate, openDatabase } from '#/platform/server/db.server'
import { NotificationService } from '#/platform/server/notifications.server'
import { FeatureRuntime, type FeatureServer } from '#/platform/server/runtime.server'
import { SettingsStore } from '#/platform/server/settings.server'
import type { NotifyInput } from '#/platform/notifications.types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-net-'))
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const db = openDatabase(join(dir, 'o.db'))
  migrate(db, 'internet', MIGRATIONS)
  const settings = new SettingsStore(db)
  const store = new InternetStore(db)
  const sent: Omit<NotifyInput, 'feature'>[] = []
  let next: Health = 'online'
  let clock = Date.parse('2026-11-27T10:00:00Z')
  const probe = async (): Promise<Sample> => {
    clock += 60_000
    const latencyMs = next === 'offline' ? null : next === 'degraded' ? 400 : 20
    return { at: clock, health: next, latencyMs, jitterMs: latencyMs === null ? null : 2, lossPct: next === 'offline' ? 100 : 0, dnsMs: 5, checks: [] }
  }
  let speed: SpeedTest = { at: 0, ok: true, downMbps: 100, upMbps: 40, error: null }
  const speedFn = async (): Promise<SpeedTest> => ({ ...speed, at: (clock += 60_000) })
  const monitor = new InternetMonitor(
    { db, settings, notify: (n) => sent.push(n), log: () => {} },
    store,
    probe as never,
    speedFn as never,
  )
  return {
    db,
    store,
    monitor,
    sent,
    setHealth: (h: Health) => (next = h),
    setSpeed: (s: Partial<SpeedTest>) => (speed = { ...speed, ...s }),
  }
}

describe('InternetMonitor', () => {
  it('records an outage and its recovery, with notifications', async () => {
    const t = setup()
    t.setHealth('online')
    await t.monitor.probeNow()
    t.setHealth('offline')
    await t.monitor.probeNow()
    await t.monitor.probeNow()
    expect(t.store.currentEvent()).toMatchObject({ kind: 'outage', endedAt: null })
    expect(t.sent.at(-1)).toMatchObject({ level: 'alert', title: 'The internet is down' })

    t.setHealth('online')
    await t.monitor.probeNow()
    await t.monitor.probeNow()
    expect(t.store.currentEvent()).toBeNull()
    expect(t.sent.at(-1)).toMatchObject({ level: 'info', title: 'The internet is back' })
    expect(t.sent.at(-1)!.body).toMatch(/down for 3 min/)
  })

  it('respects the notification settings', async () => {
    const t = setup()
    t.monitor.saveSettings({ notifyOutage: false })
    t.setHealth('offline')
    for (let i = 0; i < 3; i++) await t.monitor.probeNow()
    expect(t.store.currentEvent()?.kind).toBe('outage')
    expect(t.sent).toEqual([])
  })

  it('flags a slow speed test against the 7-day usual, once there are three', async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) await t.monitor.speedTestNow()
    expect(t.sent).toEqual([])
    t.setSpeed({ downMbps: 30 })
    await t.monitor.speedTestNow()
    expect(t.sent.at(-1)).toMatchObject({ level: 'warn', title: 'The internet is slower than usual' })
    expect(t.store.events(0, Date.now() + 1e10).some((e) => e.kind === 'slow')).toBe(true)
  })

  it('picks up an outage left open by a restart and closes it on recovery', async () => {
    const t = setup()
    t.store.openEvent('outage', Date.now() - 600_000, 'left over')
    t.monitor.start()
    t.monitor.stop()
    t.setHealth('online')
    await t.monitor.probeNow()
    await t.monitor.probeNow()
    expect(t.store.currentEvent()).toBeNull()
  })

  it('builds chart buckets, filling gaps', async () => {
    const t = setup()
    for (let i = 0; i < 5; i++) await t.monitor.probeNow()
    const latest = t.store.latestSample()!
    const buckets = t.store.buckets(latest.at - 10 * 60_000, latest.at + 60_000, 60_000)
    expect(buckets).toHaveLength(11)
    expect(buckets.filter((b) => b.count > 0)).toHaveLength(5)
    expect(buckets.find((b) => b.count > 0)).toMatchObject({ latencyAvg: 20, uptimePct: 100, state: 'online' })
  })

  it('puts samples at uneven times into the right buckets', () => {
    const t = setup()
    const base = Date.parse('2026-11-27T10:00:00Z')
    for (const offset of [1_234, 61_777, 62_999, 125_001]) {
      t.store.addSample({ at: base + offset, health: 'online', latencyMs: 10, jitterMs: 1, lossPct: 0, dnsMs: 1, checks: [] })
    }
    const buckets = t.store.buckets(base, base + 180_000, 60_000)
    expect(buckets.map((b) => b.count)).toEqual([1, 2, 1])
    expect(buckets.map((b) => b.t - base)).toEqual([0, 60_000, 120_000])
  })

  it('ignores one bad probe when colouring a bucket', () => {
    expect(bucketState(15, 0, 1)).toBe('online')
    expect(bucketState(15, 0, 3)).toBe('degraded')
    expect(bucketState(15, 3, 0)).toBe('offline')
    expect(bucketState(15, 1, 2)).toBe('degraded')
    expect(bucketState(0, 0, 0)).toBeNull()
  })

  it('formats durations', () => {
    expect(lasted(30_000)).toBe('1 min')
    expect(lasted(90 * 60_000)).toBe('1 h 30 min')
  })
})

describe('NotificationService', () => {
  it('keeps every notification in the app and sends important ones out', async () => {
    const db = openDatabase(join(dir, 'n.db'))
    const calls: { url: string; init: RequestInit }[] = []
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('ok')
    }) as typeof fetch
    const svc = new NotificationService(db, new SettingsStore(db), fake)
    svc.setDelivery({ ntfyUrl: 'https://ntfy.example/outpost', webhookUrl: 'https://hooks.example/x', minLevel: 'warn' })

    svc.notify({ feature: 'internet', level: 'info', title: 'Back' })
    svc.notify({ feature: 'internet', level: 'alert', title: 'Down', body: 'Nothing answers' })
    await new Promise((r) => setTimeout(r, 10))

    expect(svc.list().map((n) => n.title)).toEqual(['Down', 'Back'])
    expect(svc.unreadCount()).toBe(2)
    expect(calls).toHaveLength(2) // only the alert went out, to both channels
    const ntfy = calls.find((c) => c.url.includes('ntfy'))!
    expect((ntfy.init.headers as Record<string, string>).Priority).toBe('high')
    const hook = JSON.parse(String(calls.find((c) => c.url.includes('hooks'))!.init.body))
    expect(hook).toMatchObject({ source: 'outpost', feature: 'internet', level: 'alert', title: 'Down' })

    svc.markAllRead()
    expect(svc.unreadCount()).toBe(0)
  })

  it('rejects addresses that are not http(s)', () => {
    const db = openDatabase(join(dir, 'm.db'))
    const svc = new NotificationService(db, new SettingsStore(db))
    expect(() => svc.setDelivery({ ntfyUrl: 'javascript:alert(1)' })).toThrow(/http/)
  })

  it('reports delivery failures without throwing', async () => {
    const db = openDatabase(join(dir, 'f.db'))
    const svc = new NotificationService(db, new SettingsStore(db), (async () => new Response('', { status: 500 })) as typeof fetch)
    svc.setDelivery({ ntfyUrl: 'https://ntfy.example/x' })
    const errors = await svc.deliver({ feature: 'x', level: 'alert', title: 't', body: '', at: Date.now() })
    expect(errors[0]).toMatch(/500/)
    expect(svc.lastDeliveryError).toMatch(/500/)
  })
})

describe('FeatureRuntime', () => {
  it('starts features as they switch on and stops them as they switch off', async () => {
    const db = openDatabase(join(dir, 'r.db'))
    const log: string[] = []
    const server: FeatureServer = {
      migrations: ['CREATE TABLE demo_things (id INTEGER)'],
      start: () => void log.push('start'),
      stop: () => void log.push('stop'),
    }
    const runtime = new FeatureRuntime({ demo: server }, () => ({ db, settings: new SettingsStore(db), notify: () => {}, log: () => {} }))
    const state = (enabled: boolean) => [{ id: 'demo', enabled } as never]
    await runtime.sync(state(true))
    await runtime.sync(state(true))
    expect(runtime.isRunning('demo')).toBe(true)
    await runtime.sync(state(false))
    expect(log).toEqual(['start', 'stop'])
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'demo_things'").get()).toBeTruthy()
  })
})
