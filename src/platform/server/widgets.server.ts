import { checkInternet } from '#/features/internet/internet.server'
import type { WidgetData } from '#/platform/overview.types'
import type { Platform } from './platform.server'

type Loaders = { [K in keyof WidgetData]-?: (p: Platform) => Promise<NonNullable<WidgetData[K]>> }

/**
 * Server-side data for each feature's Overview card. A feature with live data
 * adds its type to WidgetData and a loader here. Loaders only run while the
 * feature is on; a failing loader gives null so one broken feature can't take
 * the Overview down.
 */
const LOADERS: Loaders = {
  internet: () => checkInternet(),
}

export async function loadWidgets(p: Platform): Promise<WidgetData> {
  const out: WidgetData = {}
  const enabled = new Set(p.features.list().filter((f) => f.enabled).map((f) => f.id))
  await Promise.all(
    (Object.keys(LOADERS) as (keyof WidgetData)[])
      .filter((id) => enabled.has(id))
      .map(async (id) => {
        try {
          out[id] = await LOADERS[id](p)
        } catch (err) {
          console.error(`[overview] ${id} failed:`, err)
          out[id] = null
        }
      }),
  )
  return out
}
