import { FEATURES } from '#/platform/features/registry'
import { dependents, parseFeatureEnv, resolveFeatures } from '#/platform/features/resolve'
import type { FeatureState } from '#/platform/features/types'
import type { SettingsStore } from './settings.server'

const KEY = 'feature.'

export class FeatureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export class FeatureService {
  private readonly forced: Map<string, boolean>

  constructor(
    private readonly settings: SettingsStore,
    featuresEnv: string | undefined,
    /** Called after any change, so the runtime can start or stop feature servers. */
    private readonly onChange: (features: FeatureState[]) => void = () => {},
  ) {
    this.forced = parseFeatureEnv(featuresEnv)
  }

  list(): FeatureState[] {
    const saved: Record<string, boolean> = {}
    for (const [id, value] of Object.entries(this.settings.byPrefix(KEY))) saved[id] = value === 'true'
    return resolveFeatures(FEATURES, saved, this.forced)
  }

  isEnabled(id: string): boolean {
    return this.list().find((f) => f.id === id)?.enabled ?? false
  }

  /**
   * Switches a feature on or off. Turning one off leaves the features that
   * need it switched on in settings, but they stop running (their `blockedBy`
   * names the reason) until it comes back on.
   */
  set(id: string, enabled: boolean): FeatureState[] {
    const feature = this.list().find((f) => f.id === id)
    if (!feature) throw new FeatureError(`There's no feature called "${id}".`, 404)
    if (feature.core) throw new FeatureError(`${feature.name} is part of the platform and can't be switched off.`, 409)
    if (feature.source === 'env') {
      throw new FeatureError(`${feature.name} is set in the server's .env file (OUTPOST_FEATURES), so it can't be changed here.`, 409)
    }
    this.settings.setBool(KEY + id, enabled)
    const list = this.list()
    this.onChange(list)
    return list
  }

  /** Back to the manifest default. */
  reset(id: string): FeatureState[] {
    this.settings.delete(KEY + id)
    const list = this.list()
    this.onChange(list)
    return list
  }

  dependentsOf(id: string): string[] {
    return dependents(FEATURES, id)
  }
}
