import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface Config {
  /** Everything Outpost keeps lives here. `/data` in the container. */
  dataDir: string
  dbPath: string
  updateDir: string
  backupDir: string
  /** The GitHub repo updates come from, "owner/name". */
  repo: string
  /** Optional token, only to raise GitHub's rate limit. */
  githubToken: string | null
  /** Raw `OUTPOST_FEATURES` value, see parseFeatureEnv. */
  featuresEnv: string | undefined
}

/** Read per call, not at import time, so nothing is fixed during the build. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(env.DATA_DIR || 'data')
  const config: Config = {
    dataDir,
    dbPath: join(dataDir, 'outpost.db'),
    updateDir: join(dataDir, 'update'),
    backupDir: join(dataDir, 'backups'),
    repo: env.OUTPOST_REPO || 'KlemmyDev/outpost',
    githubToken: env.GITHUB_TOKEN || null,
    featuresEnv: env.OUTPOST_FEATURES,
  }
  for (const dir of [config.dataDir, config.updateDir, config.backupDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  return config
}
