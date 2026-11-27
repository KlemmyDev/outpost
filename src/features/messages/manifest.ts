import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'messages',
  name: 'Messages',
  code: 'COMMS',
  description: 'MeshCore radio messaging, plus the Runner bot that answers from the library.',
  path: '/messages',
  icon: 'M4 5h16v11H9l-5 4z',
  order: 40,
  // Off by default: it needs a LoRa radio plugged into the server.
  defaultEnabled: false,
}
