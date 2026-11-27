import { describe, expect, it } from 'vitest'
import { FEATURES } from '#/platform/features/registry'
import { parseFeatureEnv, resolveFeatures, validateManifests } from '#/platform/features/resolve'
import type { FeatureManifest } from '#/platform/features/types'

const base = { name: 'x', code: 'X', description: 'x', path: '/x', icon: '', order: 0 }
const manifests: FeatureManifest[] = [
  { ...base, id: 'core', core: true, defaultEnabled: true, order: 0 },
  { ...base, id: 'library', defaultEnabled: true, order: 1 },
  { ...base, id: 'first-aid', defaultEnabled: true, requires: ['library'], order: 2 },
  { ...base, id: 'runner', defaultEnabled: true, requires: ['first-aid'], order: 3 },
  { ...base, id: 'messages', defaultEnabled: false, order: 4 },
]
const byId = (list: ReturnType<typeof resolveFeatures>) => Object.fromEntries(list.map((f) => [f.id, f]))

describe('the real feature registry', () => {
  it('has valid manifests', () => {
    expect(validateManifests(FEATURES)).toEqual([])
  })

  it('always includes the core features', () => {
    const state = byId(resolveFeatures(FEATURES, { overview: false, settings: false }, new Map()))
    expect(state.overview!.enabled).toBe(true)
    expect(state.settings!.enabled).toBe(true)
  })
})

describe('resolveFeatures', () => {
  it('uses manifest defaults on a new install', () => {
    const state = byId(resolveFeatures(manifests, {}, new Map()))
    expect(state.library!).toMatchObject({ enabled: true, source: 'default', locked: false })
    expect(state.messages!.enabled).toBe(false)
  })

  it('saved settings override defaults', () => {
    const state = byId(resolveFeatures(manifests, { messages: true }, new Map()))
    expect(state.messages!).toMatchObject({ enabled: true, source: 'settings' })
  })

  it('.env overrides settings and locks the feature', () => {
    const state = byId(resolveFeatures(manifests, { messages: true }, parseFeatureEnv('-messages')))
    expect(state.messages!).toMatchObject({ enabled: false, source: 'env', locked: true })
  })

  it('core features ignore everything and stay on', () => {
    const state = byId(resolveFeatures(manifests, { core: false }, parseFeatureEnv('-core')))
    expect(state.core!).toMatchObject({ enabled: true, source: 'core', locked: true })
  })

  it('switching a feature off switches off everything that needs it, all the way down', () => {
    const state = byId(resolveFeatures(manifests, { library: false }, new Map()))
    expect(state['first-aid']!).toMatchObject({ enabled: false, wanted: true, blockedBy: ['library'] })
    expect(state.runner!).toMatchObject({ enabled: false, wanted: true, blockedBy: ['first-aid'] })
  })

  it('treats an unknown requirement as off', () => {
    const odd: FeatureManifest[] = [{ ...base, id: 'odd', defaultEnabled: true, requires: ['ghost'] }]
    expect(resolveFeatures(odd, {}, new Map())[0]).toMatchObject({ enabled: false, blockedBy: ['ghost'] })
  })

  it('sorts by order', () => {
    expect(resolveFeatures([...manifests].reverse(), {}, new Map()).map((f) => f.id)).toEqual([
      'core',
      'library',
      'first-aid',
      'runner',
      'messages',
    ])
  })
})

describe('parseFeatureEnv', () => {
  it('reads on, +on and -off, ignoring spaces, case and blanks', () => {
    expect([...parseFeatureEnv(' Messages, +power,-map ,, ')]).toEqual([
      ['messages', true],
      ['power', true],
      ['map', false],
    ])
    expect(parseFeatureEnv(undefined).size).toBe(0)
  })
})

describe('validateManifests', () => {
  it('catches duplicate ids, bad ids and unknown requirements', () => {
    const problems = validateManifests([
      { ...base, id: 'a', defaultEnabled: true },
      { ...base, id: 'a', defaultEnabled: true },
      { ...base, id: 'Bad Id', defaultEnabled: true },
      { ...base, id: 'b', defaultEnabled: true, requires: ['nope'] },
    ])
    expect(problems).toHaveLength(3)
  })
})
