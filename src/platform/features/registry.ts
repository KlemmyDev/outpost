import type { FeatureManifest } from './types'
import { manifest as overview } from '#/features/overview/manifest'
import { manifest as library } from '#/features/library/manifest'
import { manifest as firstAid } from '#/features/first-aid/manifest'
import { manifest as map } from '#/features/map/manifest'
import { manifest as messages } from '#/features/messages/manifest'
import { manifest as power } from '#/features/power/manifest'
import { manifest as emergency } from '#/features/emergency/manifest'
import { manifest as settings } from '#/features/settings/manifest'

/**
 * Every feature Outpost knows about. To add one, create
 * `src/features/<id>/manifest.ts`, list it here, and add its route file under
 * `src/routes/` with `beforeLoad: requireFeature('<id>')`. See docs/features.md.
 */
export const FEATURES: readonly FeatureManifest[] = [
  overview,
  library,
  firstAid,
  map,
  messages,
  power,
  emergency,
  settings,
]
