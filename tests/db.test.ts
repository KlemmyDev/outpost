import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrate, openDatabase, schemaVersion } from '#/platform/server/db.server'
import { SettingsStore } from '#/platform/server/settings.server'
import { FeatureService } from '#/platform/server/features.server'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-db-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('migrations', () => {
  it('applies core migrations once', () => {
    const path = join(dir, 'a.db')
    const db = openDatabase(path)
    expect(schemaVersion(db, 'core')).toBe(1)
    db.close()
    const again = openDatabase(path)
    expect(schemaVersion(again, 'core')).toBe(1)
  })

  it('keeps each namespace separate', () => {
    const db = openDatabase(join(dir, 'b.db'))
    migrate(db, 'library', ['CREATE TABLE library_items (id INTEGER PRIMARY KEY)', 'ALTER TABLE library_items ADD COLUMN title TEXT'])
    expect(schemaVersion(db, 'library')).toBe(2)
    expect(schemaVersion(db, 'core')).toBe(1)
  })

  it('rolls back a failing step and leaves the version alone', () => {
    const db = openDatabase(join(dir, 'c.db'))
    expect(() => migrate(db, 'broken', ['CREATE TABLE ok (id INTEGER)', 'NOT SQL'])).toThrow(/broken #2/)
    expect(schemaVersion(db, 'broken')).toBe(1)
  })

  it('carries on when the database is newer than the code', () => {
    const db = openDatabase(join(dir, 'd.db'))
    migrate(db, 'x', ['CREATE TABLE x1 (id INTEGER)', 'CREATE TABLE x2 (id INTEGER)'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(migrate(db, 'x', ['CREATE TABLE x1 (id INTEGER)'])).toBe(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('feature service', () => {
  it('saves toggles and refuses core and .env features', () => {
    const settings = new SettingsStore(openDatabase(join(dir, 'e.db')))
    const features = new FeatureService(settings, '-power')
    expect(features.isEnabled('map')).toBe(true)
    features.set('map', false)
    expect(features.isEnabled('map')).toBe(false)
    expect(new FeatureService(settings, undefined).isEnabled('map')).toBe(false)
    features.reset('map')
    expect(features.isEnabled('map')).toBe(true)
    expect(() => features.set('settings', false)).toThrow(/part of the platform/)
    expect(() => features.set('power', true)).toThrow(/\.env/)
    expect(() => features.set('nope', true)).toThrow(/no feature/)
  })
})
