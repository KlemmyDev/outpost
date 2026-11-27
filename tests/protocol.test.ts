import { mkdtempSync, utimesSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readChannel, readInstaller, writeChannel, writeRequest } from '#/platform/updates/protocol'

let dir: string
const NOW = 1_800_000_000

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-update-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const beat = (seenAt: number, canUpdate = true, why = '') =>
  writeFileSync(join(dir, 'updater.json'), JSON.stringify({ seen_at: seenAt, can_update: canUpdate, why }))
const status = (s: object) => writeFileSync(join(dir, 'status.json'), JSON.stringify(s))

describe('readInstaller', () => {
  it('is not ready when the updater was never set up', () => {
    const s = readInstaller(dir, NOW)
    expect(s).toMatchObject({ ready: false, state: 'idle' })
    expect(s.why).toMatch(/isn't set up/)
  })

  it('is ready with a fresh heartbeat', () => {
    beat(NOW - 30)
    expect(readInstaller(dir, NOW)).toMatchObject({ ready: true, why: null })
  })

  it('treats a heartbeat older than 3 minutes as gone', () => {
    beat(NOW - 181)
    expect(readInstaller(dir, NOW)).toMatchObject({ ready: false })
    expect(readInstaller(dir, NOW).why).toMatch(/hasn't checked in/)
  })

  it('passes on the reason the updater gives', () => {
    beat(NOW - 10, false, 'The code folder has local changes.')
    expect(readInstaller(dir, NOW)).toMatchObject({ ready: false, why: 'The code folder has local changes.' })
  })

  it('shows a pending request', () => {
    beat(NOW - 10)
    writeRequest(dir, NOW)
    expect(readInstaller(dir, NOW + 5).state).toBe('requested')
  })

  it('shows a running update with the log tail, minus colour codes', () => {
    beat(NOW - 10)
    status({ state: 'running', started_at: NOW - 20 })
    writeFileSync(join(dir, 'update.log'), 'one\n\n\x1b[32mtwo\x1b[0m\n')
    expect(readInstaller(dir, NOW)).toMatchObject({ state: 'running', log: ['one', 'two'] })
  })

  it('shows a finished update for 15 minutes, then forgets it', () => {
    beat(NOW - 10)
    status({ state: 'failed', finished_at: NOW - 60, error: 'install.sh stopped (exit 1)' })
    expect(readInstaller(dir, NOW)).toMatchObject({ state: 'failed', error: 'install.sh stopped (exit 1)' })
    status({ state: 'done', finished_at: NOW - 16 * 60 })
    expect(readInstaller(dir, NOW).state).toBe('idle')
  })

  it('a request file takes priority over an old status', () => {
    beat(NOW - 10)
    status({ state: 'done', finished_at: NOW - 60 })
    writeRequest(dir, NOW)
    utimesSync(join(dir, 'request'), NOW, NOW)
    expect(readInstaller(dir, NOW)).toMatchObject({ state: 'requested', requestedAt: NOW })
  })
})

describe('channel file', () => {
  it('defaults to beta and round-trips', () => {
    expect(readChannel(dir)).toBe('beta')
    writeChannel(dir, 'stable')
    expect(readChannel(dir)).toBe('stable')
  })

  it('ignores junk', () => {
    writeFileSync(join(dir, 'channel'), 'canary\n')
    expect(readChannel(dir)).toBe('beta')
  })
})
