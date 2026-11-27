import type { FeatureManifest, FeatureSource, FeatureState } from './types'

/**
 * Parses the `OUTPOST_FEATURES` environment variable, a comma-separated list
 * where `name` or `+name` forces a feature on and `-name` forces it off:
 *
 *   OUTPOST_FEATURES=messages,-map
 *
 * Features named here are locked: the settings screen shows them but can't
 * change them, so a household can't undo what the server's owner decided.
 */
export function parseFeatureEnv(value: string | undefined): Map<string, boolean> {
  const forced = new Map<string, boolean>()
  if (!value) return forced
  for (const raw of value.split(',')) {
    const item = raw.trim().toLowerCase()
    if (!item) continue
    if (item.startsWith('-')) forced.set(item.slice(1).trim(), false)
    else forced.set(item.replace(/^\+/, '').trim(), true)
  }
  return forced
}

/**
 * Works out which features are on. Precedence, highest first:
 * core features (always on), `.env`, the saved setting, the manifest default.
 * A feature whose requirements are off is switched off too, repeatedly, so
 * chains of dependencies settle correctly.
 */
export function resolveFeatures(
  manifests: readonly FeatureManifest[],
  saved: Readonly<Record<string, boolean>>,
  forced: ReadonlyMap<string, boolean>,
): FeatureState[] {
  const wanted = new Map<string, { value: boolean; source: FeatureSource; locked: boolean }>()
  for (const m of manifests) {
    if (m.core) wanted.set(m.id, { value: true, source: 'core', locked: true })
    else if (forced.has(m.id)) wanted.set(m.id, { value: forced.get(m.id)!, source: 'env', locked: true })
    else if (m.id in saved) wanted.set(m.id, { value: saved[m.id]!, source: 'settings', locked: false })
    else wanted.set(m.id, { value: m.defaultEnabled, source: 'default', locked: false })
  }

  const enabled = new Map<string, boolean>()
  for (const [id, w] of wanted) enabled.set(id, w.value)

  // Unknown requirements count as off, so a typo can't silently enable a
  // feature whose dependency doesn't exist.
  let changed = true
  while (changed) {
    changed = false
    for (const m of manifests) {
      if (!enabled.get(m.id) || m.core) continue
      if ((m.requires ?? []).some((r) => !enabled.get(r))) {
        enabled.set(m.id, false)
        changed = true
      }
    }
  }

  return [...manifests]
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const w = wanted.get(m.id)!
      return {
        ...m,
        enabled: enabled.get(m.id) ?? false,
        wanted: w.value,
        source: w.source,
        locked: w.locked,
        blockedBy: (m.requires ?? []).filter((r) => !enabled.get(r)),
      }
    })
}

/** Problems with the manifests themselves, checked by the test suite. */
export function validateManifests(manifests: readonly FeatureManifest[]): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const m of manifests) {
    if (!/^[a-z][a-z0-9-]*$/.test(m.id)) problems.push(`"${m.id}" isn't a valid feature id`)
    if (ids.has(m.id)) problems.push(`"${m.id}" is declared twice`)
    ids.add(m.id)
  }
  for (const m of manifests) {
    for (const r of m.requires ?? []) {
      if (!ids.has(r)) problems.push(`"${m.id}" requires unknown feature "${r}"`)
      if (r === m.id) problems.push(`"${m.id}" requires itself`)
    }
    if (m.core && (m.requires ?? []).length > 0) problems.push(`core feature "${m.id}" can't have requirements`)
  }
  return problems
}

/** Features that must be switched off first, if `id` is turned off. */
export function dependents(manifests: readonly FeatureManifest[], id: string): string[] {
  return manifests.filter((m) => (m.requires ?? []).includes(id)).map((m) => m.id)
}
