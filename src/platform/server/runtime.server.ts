import type { DatabaseSync } from 'node:sqlite'
import type { FeatureState } from '#/platform/features/types'
import type { NotifyInput } from '#/platform/notifications.types'
import { migrate, type Migration } from './db.server'
import type { SettingsStore } from './settings.server'

/** What a feature's server side gets from the platform. */
export interface FeatureContext {
  db: DatabaseSync
  settings: SettingsStore
  notify: (n: Omit<NotifyInput, 'feature'>) => void
  log: (...args: unknown[]) => void
}

/**
 * A feature's background work. The platform runs its migrations (in the
 * feature's own namespace) and calls start() when the feature is switched on,
 * and stop() when it's switched off or the server shuts down.
 */
export interface FeatureServer {
  migrations?: Migration[]
  start(ctx: FeatureContext): void | Promise<void>
  stop(): void | Promise<void>
}

export class FeatureRuntime {
  private readonly running = new Set<string>()
  private syncing: Promise<void> = Promise.resolve()

  constructor(
    private readonly servers: Readonly<Record<string, FeatureServer>>,
    private readonly makeContext: (id: string) => FeatureContext,
  ) {}

  isRunning(id: string): boolean {
    return this.running.has(id)
  }

  /** Resolves once the latest start/stop pass has finished, for requests that arrive mid-start. */
  settled(): Promise<void> {
    return this.syncing
  }

  /** Starts what's newly on and stops what's newly off. */
  sync(features: readonly FeatureState[]): Promise<void> {
    const run = this.syncing.then(() => this.syncNow(features))
    this.syncing = run.catch(() => {})
    return run
  }

  private async syncNow(features: readonly FeatureState[]): Promise<void> {
    for (const f of features) {
      const server = this.servers[f.id]
      if (!server) continue
      if (f.enabled && !this.running.has(f.id)) {
        const ctx = this.makeContext(f.id)
        try {
          if (server.migrations) migrate(ctx.db, f.id, server.migrations)
          await server.start(ctx)
          this.running.add(f.id)
          ctx.log('started')
        } catch (err) {
          console.error(`[${f.id}] couldn't start:`, err)
        }
      } else if (!f.enabled && this.running.has(f.id)) {
        try {
          await server.stop()
        } finally {
          this.running.delete(f.id)
          console.log(`[${f.id}] stopped`)
        }
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const id of this.running) await this.servers[id]?.stop()
    this.running.clear()
  }
}
