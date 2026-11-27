import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface VersionInfo {
  /** CalVer from package.json, e.g. "2026.11.27". */
  version: string
  /** Optional label from package.json "outpost.release", e.g. "alpha". */
  release: string | null
  /** The git commit this build came from, or "" for an unknown local build. */
  commit: string
}

const SHA = /^[0-9a-f]{40}$/

/**
 * The version comes from package.json, which the Docker image copies in.
 * The commit is baked in at build time (`--build-arg GIT_COMMIT=…` becomes the
 * GIT_COMMIT environment variable). That stamp is what makes "is there an
 * update?" a commit comparison rather than a guess from version strings.
 */
export function readVersion(env: NodeJS.ProcessEnv = process.env): VersionInfo {
  let version = '0.0.0'
  let release: string | null = null
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string
      outpost?: { release?: string }
    }
    version = pkg.version ?? version
    release = pkg.outpost?.release || null
  } catch {
    // Running without a package.json next to us; keep the defaults.
  }

  let commit = SHA.test(env.GIT_COMMIT ?? '') ? env.GIT_COMMIT! : ''
  if (!commit) {
    try {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (SHA.test(head)) commit = head
    } catch {
      // Not a git checkout either: an unknown local build.
    }
  }
  return { version, release, commit }
}
