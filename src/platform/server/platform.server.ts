import type { DatabaseSync } from 'node:sqlite'
import { loadConfig, type Config } from './config.server'
import { openDatabase } from './db.server'
import { FEATURE_SERVERS } from './feature-servers.server'
import { FeatureService } from './features.server'
import { NotificationService } from './notifications.server'
import { FeatureRuntime } from './runtime.server'
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
  notifications: NotificationService
  runtime: FeatureRuntime
  startedAt: number
}

let platform: Platform | undefined

/**
 * The server's shared services, created on first use (not at import, so the
 * build never opens a database or starts timers). Features with background
 * work are started here, and started or stopped again whenever a feature is
 * switched on or off.
 */
export function getPlatform(): Platform {
  if (platform) return platform
  const config = loadConfig()
  const version = readVersion()
  const db = openDatabase(config.dbPath)
  const settings = new SettingsStore(db)
  const notifications = new NotificationService(db, settings)
  const runtime = new FeatureRuntime(FEATURE_SERVERS, (id) => ({
    db,
    settings,
    notify: (n) => notifications.notify({ ...n, feature: id }),
    log: (...args) => console.log(`[${id}]`, ...args),
  }))
  const features = new FeatureService(settings, config.featuresEnv, (list) => void runtime.sync(list))
  const updates = new UpdateService(config, settings, version)
  updates.start()
  platform = { config, version, db, settings, features, updates, notifications, runtime, startedAt: Date.now() }
  // Timers are unref'd, so nothing here holds the process open on shutdown.
  // (No SIGTERM listener: adding one would stop Node exiting on `docker stop`.)
  void runtime.sync(features.list())

  console.log(`[outpost] ${version.version}${version.release ? ` (${version.release})` : ''} ${version.commit.slice(0, 7) || 'local build'} · data in ${config.dataDir}`)
  return platform
}
