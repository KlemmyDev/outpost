/**
 * A feature module is a self-contained part of Outpost (the library, the map,
 * mesh messages…) that can be switched on or off. Every feature lives in its
 * own folder under `src/features/<id>/` and describes itself with a manifest.
 */
export interface FeatureManifest {
  /** Stable id, used in settings, `.env` and URLs. Lowercase, dashes only. */
  id: string
  /** Friendly name shown in menus, e.g. "Library". */
  name: string
  /** Tactical code shown in tags and logs, e.g. "ARCHIVE". */
  code: string
  /** One sentence for the settings screen. */
  description: string
  /** Where the feature's page lives. */
  path: string
  /** A 24×24 stroke icon as SVG path data. */
  icon: string
  /** Position in menus, low first. */
  order: number
  /** Whether a new install has it switched on. */
  defaultEnabled: boolean
  /** Core features are part of the platform and can't be switched off. */
  core?: boolean
  /** Other features this one needs. It is switched off while any are off. */
  requires?: string[]
  /** Shown in the main menu when enabled. Defaults to true. */
  inNav?: boolean
}

/** Where a feature's on/off value came from. */
export type FeatureSource = 'core' | 'default' | 'settings' | 'env'

export interface FeatureState extends FeatureManifest {
  /** Whether the feature is actually running, after dependencies. */
  enabled: boolean
  /** What was asked for, before dependencies were checked. */
  wanted: boolean
  source: FeatureSource
  /** Can't be changed from the UI: a core feature, or fixed in `.env`. */
  locked: boolean
  /** Required features that are off and so keep this one off. */
  blockedBy: string[]
}
