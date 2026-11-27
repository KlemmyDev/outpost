import { describe, expect, it } from 'vitest'
import {
  classify,
  cleanSettings,
  INITIAL_DETECTOR,
  isSlow,
  jitter,
  median,
  monthlySpeedTestGB,
  percentile,
  step,
  summarise,
  type DetectorAction,
  type DetectorState,
} from '#/features/internet/analyze'
import { DEFAULT_SETTINGS, type Health } from '#/features/internet/types'

describe('maths', () => {
  it('median, percentile and jitter', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(percentile([10, 20, 30, 40, 100], 95)).toBe(100)
    expect(percentile([10, 20, 30, 40, 100], 50)).toBe(30)
    expect(jitter([10, 14, 12])).toBe(3)
    expect(jitter([10])).toBeNull()
  })

  it('summarises a probe, counting failures as loss', () => {
    expect(summarise([10, 12, null, 14])).toEqual({ latencyMs: 12, jitterMs: 2, lossPct: 25 })
    expect(summarise([null, null])).toEqual({ latencyMs: null, jitterMs: null, lossPct: 100 })
    expect(summarise([])).toMatchObject({ lossPct: 100 })
  })
})

describe('classify', () => {
  it('uses the thresholds', () => {
    expect(classify({ latencyMs: 20, lossPct: 0 }, DEFAULT_SETTINGS)).toBe('online')
    expect(classify({ latencyMs: 400, lossPct: 0 }, DEFAULT_SETTINGS)).toBe('degraded')
    expect(classify({ latencyMs: 20, lossPct: 10 }, DEFAULT_SETTINGS)).toBe('degraded')
    expect(classify({ latencyMs: null, lossPct: 100 }, DEFAULT_SETTINGS)).toBe('offline')
  })
})

/** Runs a sequence of health readings a minute apart through the detector. */
function run(sequence: Health[]): DetectorAction[] {
  let state: DetectorState = INITIAL_DETECTOR
  const actions: DetectorAction[] = []
  sequence.forEach((h, i) => {
    const r = step(state, h, i * 60)
    state = r.state
    actions.push(...r.actions)
  })
  return actions
}

describe('outage detector', () => {
  it('ignores a single dropped probe', () => {
    expect(run(['online', 'offline', 'online', 'online'])).toEqual([])
  })

  it('opens an outage after two offline probes, dated from the first', () => {
    expect(run(['online', 'offline', 'offline'])).toEqual([{ type: 'open', kind: 'outage', at: 60 }])
  })

  it('closes it after two good probes', () => {
    expect(run(['offline', 'offline', 'offline', 'online', 'online'])).toEqual([
      { type: 'open', kind: 'outage', at: 0 },
      { type: 'close', kind: 'outage', startedAt: 0, at: 240 },
    ])
  })

  it('needs three bad probes to call it degraded', () => {
    expect(run(['degraded', 'degraded'])).toEqual([])
    expect(run(['degraded', 'degraded', 'degraded'])).toEqual([{ type: 'open', kind: 'degraded', at: 0 }])
  })

  it('turns a degraded spell into an outage when the line drops', () => {
    expect(run(['degraded', 'degraded', 'degraded', 'offline', 'offline'])).toEqual([
      { type: 'open', kind: 'degraded', at: 0 },
      { type: 'close', kind: 'degraded', startedAt: 0, at: 180 },
      { type: 'open', kind: 'outage', at: 180 },
    ])
  })

  it('ends an outage that comes back poor, then opens degraded if it stays poor', () => {
    expect(run(['offline', 'offline', 'degraded', 'degraded', 'degraded'])).toEqual([
      { type: 'open', kind: 'outage', at: 0 },
      { type: 'close', kind: 'outage', startedAt: 0, at: 120 },
      // Offline probes count as bad too, so this spell began at the first probe.
      { type: 'open', kind: 'degraded', at: 0 },
    ])
  })

  it('a good probe in the middle resets the degraded count', () => {
    expect(run(['degraded', 'degraded', 'online', 'degraded', 'degraded'])).toEqual([])
  })
})

describe('speed and settings', () => {
  it('calls a test slow below the set share of usual', () => {
    expect(isSlow(40, 100, DEFAULT_SETTINGS)).toBe(true)
    expect(isSlow(60, 100, DEFAULT_SETTINGS)).toBe(false)
    expect(isSlow(40, null, DEFAULT_SETTINGS)).toBe(false)
  })

  it('estimates monthly data use', () => {
    expect(monthlySpeedTestGB({ speedTestEveryHours: 6, speedTestMB: 25 })).toBe(4.1)
    expect(monthlySpeedTestGB({ speedTestEveryHours: 0, speedTestMB: 25 })).toBe(0)
  })

  it('clamps and fills settings', () => {
    const s = cleanSettings({ probeIntervalSec: 1, latencyWarnMs: 'x' as unknown as number, notifySlow: false }, DEFAULT_SETTINGS)
    expect(s.probeIntervalSec).toBe(15)
    expect(s.latencyWarnMs).toBe(DEFAULT_SETTINGS.latencyWarnMs)
    expect(s.notifySlow).toBe(false)
  })
})
