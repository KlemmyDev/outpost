import { describe, expect, it } from 'vitest'
import { compareVersions, isChannel, newestTag, parseTag } from '#/platform/updates/channels'

describe('versions', () => {
  it('compares CalVer numerically, not as text', () => {
    expect(compareVersions('2026.11.27', '2026.11.3')).toBe(1)
    expect(compareVersions('2026.2.1', '2026.11.1')).toBe(-1)
    expect(compareVersions('2026.11.27.1', '2026.11.27')).toBe(1)
    expect(compareVersions('2026.11.27', '2026.11.27')).toBe(0)
  })
})

describe('tags and channels', () => {
  const tags = ['v2026.11.1', 'v2026.11.20-beta', 'v2026.11.20-beta.2', 'v2026.11.3', 'nonsense', 'v2026.10.30-rc1']

  it('parses release tags and ignores anything else', () => {
    expect(parseTag('v2026.11.20-beta')).toMatchObject({ version: '2026.11.20', beta: true, betaNumber: 1 })
    expect(parseTag('v2026.11.20-beta.3')).toMatchObject({ beta: true, betaNumber: 3 })
    expect(parseTag('v2026.11.3')).toMatchObject({ beta: false, betaNumber: 0 })
    expect(parseTag('v2026.10.30-rc1')).toBeNull()
    expect(parseTag('2026.11.3')).toBeNull()
  })

  it('stable follows only plain version tags', () => {
    expect(newestTag(tags, 'stable')?.name).toBe('v2026.11.3')
  })

  it('beta follows the newest tag, beta or stable', () => {
    expect(newestTag(tags, 'beta')?.name).toBe('v2026.11.20-beta.2')
    expect(newestTag([...tags, 'v2026.11.20'], 'beta')?.name).toBe('v2026.11.20')
  })

  it('a stable release sorts after its own betas', () => {
    expect(newestTag(['v2026.12.1', 'v2026.12.1-beta.4'], 'beta')?.name).toBe('v2026.12.1')
  })

  it('has nothing to offer when no tags match', () => {
    expect(newestTag(['v2026.11.20-beta'], 'stable')).toBeNull()
    expect(newestTag([], 'beta')).toBeNull()
  })

  it('knows its channels', () => {
    expect(isChannel('beta')).toBe(true)
    expect(isChannel('canary')).toBe(false)
  })
})
