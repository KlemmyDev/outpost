import type { KitItem } from './types'

/**
 * An emergency kit, from the lists Australian Red Cross and Get Ready
 * Queensland recommend, in Outpost's words. Enough to leave with in a hurry,
 * or to stay put for three days without power or shops.
 */
export const DEFAULT_KIT: Omit<KitItem, 'have' | 'expires' | 'custom'>[] = [
  { id: 'water', name: 'Drinking water', hint: 'At least 10 litres a person, enough for three days. Swap it every year.' },
  { id: 'food', name: 'Food that keeps', hint: 'Three days of tins and packets that need no cooking, and a can opener.' },
  { id: 'torch', name: 'Torch and spare batteries', hint: 'A head torch frees your hands.' },
  { id: 'radio', name: 'Battery or wind-up radio', hint: 'For ABC Local Radio, the emergency broadcaster, when phones and internet are down.' },
  { id: 'first-aid', name: 'First aid kit', hint: 'Check what’s used up or out of date.' },
  { id: 'medicines', name: 'Medicines and scripts', hint: 'A week’s supply, and copies of prescriptions.' },
  { id: 'power-bank', name: 'Phone chargers and a power bank', hint: 'Charged. Car chargers too.' },
  { id: 'documents', name: 'Copies of important documents', hint: 'IDs, insurance, deeds, in a waterproof bag (or on a USB stick).' },
  { id: 'cash', name: 'Some cash', hint: 'Card machines need power and internet.' },
  { id: 'clothes', name: 'Clothes and sturdy shoes', hint: 'A change for everyone, warm layers and rain gear.' },
  { id: 'toiletries', name: 'Toiletries and sanitary items', hint: 'Soap, hand sanitiser, toilet paper, nappies if needed.' },
  { id: 'masks', name: 'P2 masks and gloves', hint: 'For smoke, dust and clean-up.' },
  { id: 'pets', name: 'Pet supplies', hint: 'Food, water, lead or carrier, and vaccination records.' },
  { id: 'tools', name: 'Multi-tool, tape and rope', hint: 'Duct tape and a tarp for quick repairs.' },
  { id: 'whistle', name: 'Whistle', hint: 'To be heard if you’re trapped.' },
]

export function defaultKit(): KitItem[] {
  return DEFAULT_KIT.map((k) => ({ ...k, have: false, expires: null, custom: false }))
}

/** Items expiring within this many days are flagged. */
export const EXPIRY_WARN_DAYS = 30

export function expiringSoon(item: KitItem, now = Date.now()): boolean {
  if (!item.expires) return false
  const t = Date.parse(`${item.expires}T00:00:00`)
  return Number.isFinite(t) && t - now < EXPIRY_WARN_DAYS * 86_400_000
}
