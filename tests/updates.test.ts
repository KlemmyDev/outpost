import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { countChanges } from '#/platform/updates/changes'
import { loadConfig } from '#/platform/server/config.server'
import { openDatabase } from '#/platform/server/db.server'
import { SettingsStore } from '#/platform/server/settings.server'
import { UpdateService } from '#/platform/server/updates.server'
import { writeChannel } from '#/platform/updates/protocol'

const OLD = 'a'.repeat(40)
const NEW = 'b'.repeat(40)
const MID = 'c'.repeat(40)

const commit = (sha: string, parents: string[], message: string) => ({
  sha,
  parents: parents.map((p) => ({ sha: p })),
  commit: { message },
})

describe('countChanges', () => {
  it('counts first-parent commits and skips version bumps', () => {
    const commits = [
      commit('pr1', [OLD], 'inside a PR'),
      commit(MID, [OLD, 'pr1'], 'Merge pull request #1'),
      commit('v', [MID], 'Version 2026.11.27'),
      commit(NEW, ['v'], 'Fix the thing'),
    ]
    expect(countChanges(commits, NEW)).toBe(2)
  })
})

describe('UpdateService', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'outpost-svc-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function service(routes: Record<string, unknown>, commitNow = OLD, version = '2026.11.1') {
    const config = loadConfig({ DATA_DIR: dir, OUTPOST_REPO: 'me/outpost' })
    const settings = new SettingsStore(openDatabase(config.dbPath))
    const fake = (async (url: string) => {
      const key = Object.keys(routes).find((k) => url.endsWith(k))
      if (!key) return new Response('{}', { status: 404 })
      const body = routes[key]
      if (typeof body === 'number') return new Response('{}', { status: body })
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    return { svc: new UpdateService(config, settings, { version, release: null, commit: commitNow }, fake), config }
  }

  it('finds a newer beta and counts its changes', async () => {
    const { svc } = service({
      '/tags?per_page=100': [
        { name: 'v2026.11.27-beta', commit: { sha: NEW } },
        { name: 'v2026.11.1', commit: { sha: OLD } },
      ],
      [`/compare/${OLD}...${NEW}`]: { ahead_by: 1, behind_by: 0, commits: [commit(NEW, [OLD], 'Add the map')] },
    })
    await svc.check()
    const s = svc.status()
    expect(s.channel).toBe('beta')
    expect(s).toMatchObject({ available: true, move: 'update', error: null })
    expect(s.latest).toMatchObject({ version: '2026.11.27', tag: 'v2026.11.27-beta', changes: 1 })
  })

  it('says "older" when the channel is behind what is running', async () => {
    const { svc, config } = service(
      {
        '/tags?per_page=100': [{ name: 'v2026.11.1', commit: { sha: OLD } }],
        [`/compare/${NEW}...${OLD}`]: { ahead_by: 0, behind_by: 3, commits: [] },
      },
      NEW,
      '2026.11.27',
    )
    writeChannel(config.updateDir, 'stable')
    await svc.check()
    expect(svc.status()).toMatchObject({ move: 'older', available: false })
  })

  it('is up to date when the target is the running commit', async () => {
    const { svc } = service({ '/tags?per_page=100': [{ name: 'v2026.11.1', commit: { sha: OLD } }] })
    await svc.check()
    expect(svc.status()).toMatchObject({ move: null, available: false })
  })

  it('follows main on nightly, reading the version from package.json', async () => {
    const { svc, config } = service({
      '/commits/main': { sha: NEW, commit: { committer: { date: '2026-11-27T00:00:00Z' } } },
      [`/${NEW}/package.json`]: { version: '2026.11.27', outpost: { release: 'alpha' } },
      [`/compare/${OLD}...${NEW}`]: { ahead_by: 2, behind_by: 0, commits: [commit(NEW, [MID], 'b'), commit(MID, [OLD], 'a')] },
    })
    writeChannel(config.updateDir, 'nightly')
    await svc.check()
    expect(svc.status().latest).toMatchObject({ version: '2026.11.27', release: 'alpha', changes: 2 })
  })

  it('reports rate limits in plain words and keeps the last result', async () => {
    const { svc } = service({ '/tags?per_page=100': 403 })
    await svc.check()
    expect(svc.status().error).toMatch(/rate limit/)
  })

  it('refuses to install without a live updater, then writes the request', () => {
    const { svc, config } = service({})
    expect(() => svc.requestInstall()).toThrow(/isn't set up/)
    writeFileSync(
      join(config.updateDir, 'updater.json'),
      JSON.stringify({ seen_at: Math.floor(Date.now() / 1000), can_update: true }),
    )
    expect(svc.requestInstall().install.state).toBe('requested')
    expect(() => svc.requestInstall()).toThrow(/already/)
  })
})
