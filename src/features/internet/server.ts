import type { FeatureServer } from '#/platform/server/runtime.server'
import { InternetMonitor } from './monitor.server'
import { InternetStore, MIGRATIONS } from './store.server'

let monitor: InternetMonitor | null = null

/** The running monitor, or null while the feature is switched off. */
export function getMonitor(): InternetMonitor | null {
  return monitor
}

export const server: FeatureServer = {
  migrations: MIGRATIONS,
  start(ctx) {
    monitor = new InternetMonitor(ctx, new InternetStore(ctx.db))
    monitor.start()
  },
  stop() {
    monitor?.stop()
    monitor = null
  },
}
