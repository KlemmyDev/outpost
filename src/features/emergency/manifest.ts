import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'emergency',
  name: 'Emergency',
  code: 'WATCHTOWER',
  description: 'Bushfire, flood and storm plans, and the numbers to call.',
  path: '/emergency',
  icon: 'M12 3l9 16H3zM12 10v4M12 17v.1',
  order: 60,
  defaultEnabled: true,
}
