import { describe, expect, it } from 'vitest'
import { FEATURES } from '#/platform/features/registry'
import { WIDGETS } from '#/platform/features/widgets'
import { formatBytes, formatDuration, percent } from '#/platform/ui/format'

describe('overview widgets', () => {
  it('every widget belongs to a real, non-core feature', () => {
    const ids = new Map(FEATURES.map((f) => [f.id, f]))
    for (const id of Object.keys(WIDGETS)) {
      expect(ids.has(id), `${id} isn't in the feature registry`).toBe(true)
      expect(ids.get(id)!.core, `${id} is core; core cards live in the Overview itself`).toBeFalsy()
    }
  })
})

describe('formatting', () => {
  it('formats sizes for people', () => {
    expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB')
    expect(formatBytes(300 * 1024 ** 2)).toBe('300 MB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB')
  })

  it('formats durations for people', () => {
    expect(formatDuration(30)).toBe('1 min')
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 5 min')
    expect(formatDuration(2 * 86400 + 3600)).toBe('2 days, 1 h')
    expect(formatDuration(86400)).toBe('1 day')
  })

  it('works out percentages safely', () => {
    expect(percent(1, 4)).toBe(25)
    expect(percent(1, 0)).toBe(0)
  })
})
