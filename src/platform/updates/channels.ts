/**
 * Release channels, and the one rule for which git tag belongs to which.
 *
 *   nightly  follows the head of `main`
 *   beta     the newest `vX.Y.Z` or `vX.Y.Z-beta[.N]` tag
 *   stable   the newest `vX.Y.Z` tag only
 *
 * The same rule lives in bash in install.sh (`channel_tag`) and
 * scripts/release.sh. If you change it here, change it there too; the tests
 * in tests/channels.test.ts pin the behaviour.
 */
export type Channel = 'nightly' | 'beta' | 'stable'
export const CHANNELS: readonly Channel[] = ['nightly', 'beta', 'stable']
export const DEFAULT_CHANNEL: Channel = 'beta'

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value)
}

/** Versions are CalVer, `YYYY.M.D` with an optional `.N` for a second release that day. */
export function versionKey(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number)
}

export function compareNumbers(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export function compareVersions(a: string, b: string): number {
  return compareNumbers(versionKey(a), versionKey(b))
}

const TAG = /^v(\d+(?:\.\d+)*)(-beta(?:\.(\d+))?)?$/

export interface ParsedTag {
  name: string
  version: string
  beta: boolean
  /** `-beta` counts as beta 1, `-beta.2` as 2. 0 for a stable tag. */
  betaNumber: number
}

export function parseTag(name: string): ParsedTag | null {
  const m = TAG.exec(name)
  if (!m) return null
  const beta = m[2] !== undefined
  return { name, version: m[1]!, beta, betaNumber: beta ? Number(m[3] ?? 1) : 0 }
}

/** Orders tags oldest first. A stable release sorts after its own betas. */
export function compareTags(a: ParsedTag, b: ParsedTag): number {
  const byVersion = compareVersions(a.version, b.version)
  if (byVersion !== 0) return byVersion
  if (a.beta !== b.beta) return a.beta ? -1 : 1
  return Math.sign(a.betaNumber - b.betaNumber)
}

export function tagOnChannel(tag: ParsedTag, channel: Exclude<Channel, 'nightly'>): boolean {
  return channel === 'beta' || !tag.beta
}

export function newestTag(names: readonly string[], channel: Exclude<Channel, 'nightly'>): ParsedTag | null {
  let best: ParsedTag | null = null
  for (const name of names) {
    const tag = parseTag(name)
    if (!tag || !tagOnChannel(tag, channel)) continue
    if (!best || compareTags(tag, best) > 0) best = tag
  }
  return best
}
