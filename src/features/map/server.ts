import type { FeatureContext, FeatureServer } from '#/platform/server/runtime.server'
import { getLibrary } from '#/features/library/server'
import { isAppBook } from '#/features/library/types'
import { buildPlaceIndex, type Bounds } from './places.server'
import { MapStore, MIGRATIONS } from './store.server'
import type { IndexStatus, MapData, MapSource, MapStatus, PlaceHit } from './types'

const SOURCE_KEY = 'map.source'

/**
 * The Map's server side. Map files are Kiwix maps ZIMs, downloaded and served
 * by the Library; this keeps the waypoints, works out which map to show, and
 * builds each map's place index in the background so search works offline.
 */
export class MapService {
  private bounds = new Map<string, Bounds | null>()
  private building: IndexStatus | null = null
  private failed = new Map<string, string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private abort: AbortController | null = null

  constructor(
    readonly store: MapStore,
    private readonly ctx: FeatureContext,
  ) {}

  start(): void {
    const tick = () => void this.ensureIndex().catch((err) => this.ctx.log('index check failed:', (err as Error).message))
    // Give the Library a moment to start first.
    setTimeout(tick, 3000).unref?.()
    // New maps arrive through Library downloads; look for them now and then.
    this.timer = setInterval(tick, 60_000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.abort?.abort()
  }

  private library() {
    const library = getLibrary()
    if (!library) throw new Error('The Map needs the Library, which keeps the map files. Switch it on in Settings.')
    return library
  }

  /** Installed maps, biggest (most detailed) first. */
  async sources(): Promise<{ online: boolean; sources: MapSource[] }> {
    const library = getLibrary()
    if (!library) return { online: false, sources: [] }
    const { online, books } = await library.booksOrOffline()
    const maps = books.filter((b) => isAppBook(b))
    const sources = await Promise.all(
      maps.map(async (b): Promise<MapSource> => ({ contentId: b.contentId, title: b.title, sizeBytes: b.sizeBytes, bounds: await this.boundsOf(b.contentId) })),
    )
    sources.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    return { online, sources }
  }

  private async boundsOf(contentId: string): Promise<Bounds | null> {
    if (this.bounds.has(contentId)) return this.bounds.get(contentId)!
    let bounds: Bounds | null = null
    try {
      const res = await this.library().kiwix.raw(contentId, 'content/config.json')
      if (res.ok) {
        const cfg = (await res.json()) as { boundingBox?: unknown }
        const b = cfg.boundingBox
        if (Array.isArray(b) && b.length === 2 && b.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number'))) bounds = b as Bounds
      }
    } catch {
      // No bounds: the page shows the whole map instead.
    }
    this.bounds.set(contentId, bounds)
    return bounds
  }

  async current(sources?: MapSource[]): Promise<MapSource | null> {
    const list = sources ?? (await this.sources()).sources
    const chosen = this.ctx.settings.get(SOURCE_KEY)
    return list.find((s) => s.contentId === chosen) ?? list[0] ?? null
  }

  setCurrent(contentId: string): void {
    this.ctx.settings.set(SOURCE_KEY, contentId)
    void this.ensureIndex()
  }

  indexStatus(contentId: string): IndexStatus {
    if (this.building?.contentId === contentId) return this.building
    const done = this.store.indexed(contentId)
    const error = this.failed.get(contentId) ?? null
    return {
      contentId,
      state: done ? 'ready' : error ? 'failed' : 'idle',
      done: 0,
      total: 0,
      places: done?.places ?? 0,
      builtAt: done?.builtAt ?? null,
      error,
    }
  }

  /** Builds the place index for any installed map that doesn't have one. */
  async ensureIndex(force?: string): Promise<void> {
    if (this.building) return
    const { sources } = await this.sources()
    const current = await this.current(sources)
    // The map on show first, then any others.
    const order = current ? [current, ...sources.filter((s) => s.contentId !== current.contentId)] : sources
    const todo = order.find((s) => s.contentId === force || (!this.store.indexed(s.contentId) && !this.failed.has(s.contentId)))
    if (!todo) return
    await this.build(todo)
  }

  rebuild(contentId: string): void {
    this.failed.delete(contentId)
    this.store.forgetPlaces(contentId)
    void this.ensureIndex(contentId)
  }

  private async build(source: MapSource): Promise<void> {
    const kiwix = this.library().kiwix
    const bounds = source.bounds ?? [[-180, -85], [180, 85]]
    this.building = { contentId: source.contentId, state: 'building', done: 0, total: 0, places: 0, builtAt: null, error: null }
    this.abort = new AbortController()
    const started = Date.now()
    try {
      const places = await buildPlaceIndex({
        bounds,
        signal: this.abort.signal,
        onProgress: (done, total) => {
          if (this.building) Object.assign(this.building, { done, total })
        },
        fetchTile: async (z, x, y) => {
          const res = await kiwix.raw(source.contentId, `tiles/${z}/${x}/${y}.pbf`)
          if (!res.ok) {
            await res.body?.cancel()
            return null
          }
          return new Uint8Array(await res.arrayBuffer())
        },
      })
      this.store.replacePlaces(source.contentId, places)
      this.ctx.log(`indexed ${places.length} places in ${source.contentId} (${Math.round((Date.now() - started) / 1000)} s)`)
    } catch (err) {
      if (!this.abort.signal.aborted) {
        this.failed.set(source.contentId, (err as Error).message)
        this.ctx.log(`couldn't index ${source.contentId}:`, (err as Error).message)
      }
    } finally {
      this.building = null
      this.abort = null
    }
    // There may be another map waiting.
    if (!this.failed.has(source.contentId)) void this.ensureIndex()
  }

  search(q: string, near?: { lat: number; lon: number }, contentId?: string): PlaceHit[] {
    return contentId ? this.store.searchPlaces(contentId, q, 12, near) : []
  }

  async data(): Promise<MapData> {
    const { online, sources } = await this.sources()
    const current = await this.current(sources)
    const library = getLibrary()
    const dl = library?.downloads.list().find((d) => d.name.startsWith('maps_') && (d.state === 'downloading' || d.state === 'verifying' || d.state === 'queued')) ?? null
    return {
      libraryOnline: online,
      sources,
      current,
      waypoints: this.store.waypoints(),
      index: current ? this.indexStatus(current.contentId) : null,
      download: dl ? { title: dl.title, bytes: dl.bytes, sizeBytes: dl.sizeBytes, state: dl.state } : null,
    }
  }

  async status(): Promise<MapStatus> {
    const data = await this.data()
    return {
      map: data.current?.title ?? null,
      waypoints: data.waypoints.length,
      homeSet: data.waypoints.some((w) => w.kind === 'home'),
      download: data.download ? { title: data.download.title, bytes: data.download.bytes, sizeBytes: data.download.sizeBytes } : null,
    }
  }
}

let service: MapService | null = null

export function getMap(): MapService | null {
  return service
}

export const server: FeatureServer = {
  migrations: MIGRATIONS,
  start(ctx) {
    service = new MapService(new MapStore(ctx.db), ctx)
    service.start()
  },
  stop() {
    service?.stop()
    service = null
  },
}
