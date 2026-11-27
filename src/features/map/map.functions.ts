import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { getLibraryReady } from '#/features/library/server'
import { getMap } from './server'
import { cleanWaypoint, type WaypointInput } from './store.server'
import type { MapData, PlaceHit, Waypoint } from './types'

async function map() {
  if (!getPlatform().features.isEnabled('map')) throw new Error('The Map is switched off.')
  let service = getMap()
  if (!service) {
    await getPlatform().runtime.settled()
    service = getMap()
  }
  if (!service) throw new Error('The Map is still starting. Try again in a moment.')
  return service
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export const getMapData = createServerFn({ method: 'GET' }).handler(async (): Promise<MapData> => (await map()).data())

/** Polled while the place index builds or a map downloads. */
export const getMapProgress = createServerFn({ method: 'GET' }).handler(async () => {
  const data = await (await map()).data()
  return { index: data.index, download: data.download, sources: data.sources.length }
})

export const searchPlaces = createServerFn({ method: 'GET' })
  .validator((d: { q?: string; lat?: number; lon?: number; contentId?: string }) => ({
    q: typeof d?.q === 'string' ? d.q.slice(0, 80) : '',
    lat: num(d?.lat),
    lon: num(d?.lon),
    contentId: typeof d?.contentId === 'string' ? d.contentId.slice(0, 200) : '',
  }))
  .handler(async ({ data }): Promise<PlaceHit[]> => {
    const service = await map()
    const near = data.lat !== undefined && data.lon !== undefined ? { lat: data.lat, lon: data.lon } : undefined
    return service.search(data.q, near, data.contentId || (await service.current())?.contentId)
  })

export const saveWaypoint = createServerFn({ method: 'POST' })
  .validator((d: Partial<WaypointInput> & { id?: number }) => ({ id: num(d?.id), w: cleanWaypoint(d ?? {}) }))
  .handler(async ({ data }): Promise<Waypoint> => {
    const { store } = await map()
    const saved = data.id ? store.updateWaypoint(data.id, data.w) : store.addWaypoint(data.w)
    if (!saved) throw new Error('That waypoint no longer exists.')
    return saved
  })

export const deleteWaypoint = createServerFn({ method: 'POST' })
  .validator((d: { id: number }) => ({ id: num(d?.id) ?? 0 }))
  .handler(async ({ data }) => {
    ;(await map()).store.deleteWaypoint(data.id)
    return { ok: true }
  })

export const chooseMap = createServerFn({ method: 'POST' })
  .validator((d: { contentId: string }) => ({ contentId: typeof d?.contentId === 'string' ? d.contentId.slice(0, 200) : '' }))
  .handler(async ({ data }) => {
    ;(await map()).setCurrent(data.contentId)
    return { ok: true }
  })

export const rebuildPlaces = createServerFn({ method: 'POST' })
  .validator((d: { contentId: string }) => ({ contentId: typeof d?.contentId === 'string' ? d.contentId.slice(0, 200) : '' }))
  .handler(async ({ data }) => {
    ;(await map()).rebuild(data.contentId)
    return { ok: true }
  })

/** Starts downloading Kiwix's map of Australia through the Library. */
export const downloadAustraliaMap = createServerFn({ method: 'POST' }).handler(async () => {
  await map()
  const library = await getLibraryReady()
  if (!library) throw new Error('The Map needs the Library switched on.')
  const entry = (await library.catalog.versions('maps_en_australia'))[0]
  if (!entry) throw new Error("Couldn't find the map of Australia in Kiwix's catalogue. Check the internet connection.")
  return library.downloads.add(entry)
})
