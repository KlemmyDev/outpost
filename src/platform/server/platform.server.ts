import type { DatabaseSync } from 'node:sqlite'
import { loadConfig, type Config } from './config.server'
import { openDatabase } from './db.server'
import { FeatureService } from './features.server'
import { SettingsStore } from './settings.server'
import { UpdateService } from './updates.server'
import { readVersion, type VersionInfo } from './version.server'

export interface Platform {
  config: Config
  version: VersionInfo
  db: DatabaseSync
  settings: SettingsStore
  features: FeatureService
  updates: UpdateService
  startedAt: number
}

let platform: Platform | undefined

/**
 * The server's shared services, created on first use (not at import, so the
 * build never opens a database or starts timers). Feature modules with a
 * server side will hang off this too: their migrations run here, and their
 * background jobs start and stop as the feature is switched on and off.
 */
export function getPlatform(): Platform {
  if (platform) return platform
  const config = loadConfig()
  const version = readVersion()
  const db = openDatabase(config.dbPath)
  const settings = new SettingsStore(db)
  const features = new FeatureService(settings, config.featuresEnv)
  const updates = new UpdateService(config, settings, version)
  updates.start()
  platform = { config, version, db, settings, features, updates, startedAt: Date.now() }
  console.log(`[outpost] ${version.version}${version.release ? ` (${version.release})` : ''} ${version.commit.slice(0, 7) || 'local build'} · data in ${config.dataDir}`)
  return platform
}
