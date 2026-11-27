import { server as internet } from '#/features/internet/server'
import type { FeatureServer } from './runtime.server'

/**
 * Features with background work. Each one's server is started when the
 * feature is switched on and stopped when it's switched off.
 */
export const FEATURE_SERVERS: Readonly<Record<string, FeatureServer>> = {
  internet,
}
