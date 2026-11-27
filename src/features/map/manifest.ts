import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'map',
  name: 'Map',
  code: 'RECON',
  description: 'Offline maps of Australia with place search, waypoints and measuring. Map files come through the Library.',
  path: '/map',
  icon: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  order: 30,
  defaultEnabled: true,
  requires: ['library'],
}
