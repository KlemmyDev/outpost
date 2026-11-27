import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'library',
  name: 'Library',
  code: 'ARCHIVE',
  description: 'Offline Wikipedia, books and guides, searchable without the internet.',
  path: '/library',
  icon: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  order: 10,
  defaultEnabled: true,
}
