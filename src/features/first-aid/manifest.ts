import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'first-aid',
  name: 'First aid',
  code: 'AID STATION',
  description: 'Australian first aid guidance and WikiMed, with emergency numbers up front.',
  path: '/first-aid',
  icon: 'M4 4h16v16H4zM12 8v8M8 12h8',
  order: 20,
  defaultEnabled: true,
  requires: ['library'],
}
