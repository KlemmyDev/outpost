import { getMonitor } from '#/features/internet/server'
import { getLibrary } from '#/features/library/server'
import { getMap } from '#/features/map/server'
import { getMessages } from '#/features/messages/server'
import { getPower } from '#/features/power/server'
import { getEmergency } from '#/features/emergency/server'
import { firstAidData, firstAidStatus } from '#/features/first-aid/first-aid.functions'
import type { WidgetData } from '#/platform/overview.types'
import type { Platform } from './platform.server'

type Loaders = { [K in keyof WidgetData]-?: (p: Platform) => Promise<NonNullable<WidgetData[K]> | null> | NonNullable<WidgetData[K]> | null }

/**
 * Server-side data for each feature's Overview card. A feature with live data
 * adds its type to WidgetData and a loader here. Loaders only run while the
 * feature is on; a failing loader gives null so one broken feature can't take
 * the Overview down.
 */
const LOADERS: Loaders = {
  internet: () => getMonitor()?.status() ?? null,
  library: async () => (await getLibrary()?.status()) ?? null,
  map: async () => (await getMap()?.status()) ?? null,
  messages: () => getMessages()?.widget() ?? null,
  power: () => getPower()?.widget() ?? null,
  emergency: () => getEmergency()?.widget() ?? null,
  'first-aid': async () => {
    const library = getLibrary()
    return library ? firstAidStatus(await firstAidData(library)) : null
  },
}

export async function loadWidgets(p: Platform): Promise<WidgetData> {
  const out: WidgetData = {}
  const enabled = new Set(p.features.list().filter((f) => f.enabled).map((f) => f.id))
  await Promise.all(
    (Object.keys(LOADERS) as (keyof WidgetData)[])
      .filter((id) => enabled.has(id))
      .map(async (id) => {
        try {
          ;(out as Record<string, unknown>)[id] = await LOADERS[id](p)
        } catch (err) {
          console.error(`[overview] ${id} failed:`, err)
          out[id] = null
        }
      }),
  )
  return out
}
