import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'internet',
  name: 'Internet',
  code: 'NET',
  description: 'Whether the internet is up and how quick it is. Checks reach Cloudflare DNS and GitHub.',
  path: '/internet',
  icon: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.1',
  order: 5,
  defaultEnabled: true,
  inNav: false,
}
