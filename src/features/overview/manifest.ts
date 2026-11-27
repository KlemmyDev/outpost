import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'overview',
  name: 'Overview',
  code: 'HQ',
  description: 'The home screen: what matters right now, across every feature.',
  path: '/',
  icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  order: 0,
  defaultEnabled: true,
  core: true,
}
