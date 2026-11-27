import type { FeatureManifest } from '#/platform/features/types'

export const manifest: FeatureManifest = {
  id: 'messages',
  name: 'Messages',
  code: 'COMMS',
  description: 'Text over MeshCore LoRa radio, with no internet or phone network: channels, direct messages and radios in range.',
  path: '/messages',
  icon: 'M4 5h16v11H9l-5 4z',
  order: 40,
  // Off by default: it needs a LoRa radio plugged into the server.
  defaultEnabled: false,
}
