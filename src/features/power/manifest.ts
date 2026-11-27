import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'power',
  name: 'Power',
  code: 'PWR',
  description: 'Solar, battery and off-grid runtime from WattsMyPower.',
  path: '/power',
  icon: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  order: 50,
  // Off by default: it needs a WattsMyPower server to read from.
  defaultEnabled: false,
}
