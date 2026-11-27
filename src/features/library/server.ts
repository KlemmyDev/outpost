import { join } from 'node:path'
import { loadConfig } from '#/platform/server/config.server'
import { getPlatform } from '#/platform/server/platform.server'
import type { FeatureServer } from '#/platform/server/runtime.server'
import { Catalog } from './catalog.server'
import { DEFAULT_PARALLEL, DownloadManager } from './downloads.server'
import { GuideManager } from './guides/guides.server'
import { KiwixClient } from './kiwix.server'
import { LibraryStore, MIGRATIONS } from './store.server'
import type { Book, LibraryStatus } from './types'

/**
 * The Library's server side: the Kiwix sidecar that reads ZIM files, the
 * downloads manager that fetches them, and the online catalogue they come
 * from. ZIMs live in `<data>/library`, which Kiwix mounts read-only.
 */
export class Library {
  readonly catalog = new Catalog()
  private bookCache: { at: number; books: Book[] } | null = null
  /** Books just removed, hidden until Kiwix notices the file has gone. */
  private removed = new Map<string, number>()

  constructor(
    readonly kiwix: KiwixClient,
    readonly store: LibraryStore,
    readonly downloads: DownloadManager,
    readonly guides: GuideManager,
  ) {}

  /** Kiwix's books plus the Australian guides, alphabetical. */
  private withGuides(books: Book[]): Book[] {
    const g = this.guides.book()
    return g ? [...books, g].sort((a, b) => a.title.localeCompare(b.title) || a.contentId.localeCompare(b.contentId)) : books
  }

  /** Installed books, alphabetical, with the guides as one more. Kiwix's list is cached for a few seconds. */
  async books(): Promise<Book[]> {
    return this.withGuides(await this.kiwixBooks())
  }

  private async kiwixBooks(): Promise<Book[]> {
    if (this.bookCache && Date.now() - this.bookCache.at < 5000) return this.bookCache.books
    const list = await this.kiwix.books()
    const books = await Promise.all(list.map(async (b) => ({ ...b, sizeBytes: await this.downloads.fileSize(b.contentId) })))
    const now = Date.now()
    for (const [id, until] of this.removed) if (until < now) this.removed.delete(id)
    books.splice(0, books.length, ...books.filter((b) => !(this.removed.has(b.contentId) && b.sizeBytes === null)))
    books.sort((a, b) => a.title.localeCompare(b.title) || a.contentId.localeCompare(b.contentId))
    this.bookCache = { at: Date.now(), books }
    return books
  }

  forgetBooks(): void {
    this.bookCache = null
  }

  async removeBook(contentId: string): Promise<void> {
    await this.downloads.remove(contentId)
    this.store.retireFinished(contentId)
    this.removed.set(contentId, Date.now() + 60_000)
    this.bookCache = null
  }

  async book(contentId: string): Promise<Book | null> {
    return (await this.books()).find((b) => b.contentId === contentId) ?? null
  }

  /** Books, or an empty list with `online: false` when Kiwix isn't running. */
  async booksOrOffline(): Promise<{ online: boolean; books: Book[] }> {
    try {
      return { online: true, books: await this.books() }
    } catch {
      // The guides don't need Kiwix.
      return { online: false, books: this.withGuides([]) }
    }
  }

  async status(): Promise<LibraryStatus> {
    const { online, books } = await this.booksOrOffline()
    const list = this.downloads.list()
    const current = list.find((d) => d.state === 'downloading' || d.state === 'verifying') ?? null
    return {
      online,
      books: books.length,
      articles: books.reduce((n, b) => n + b.articleCount, 0),
      bytes: books.reduce((n, b) => n + (b.sizeBytes ?? 0), 0),
      download: current ? { title: current.title, bytes: current.bytes, sizeBytes: current.sizeBytes, state: current.state } : null,
      queued: list.filter((d) => d.state === 'queued').length,
    }
  }
}

/** Settings key for how many downloads run at once. */
export const PARALLEL_KEY = 'library.parallel'

let library: Library | null = null

/** The running Library, or null while the feature is switched off. */
export function getLibrary(): Library | null {
  return library
}

/** The Library, waiting for it if the server is still starting features. */
export async function getLibraryReady(): Promise<Library | null> {
  if (!library) await getPlatform().runtime.settled()
  return library
}

export const server: FeatureServer = {
  migrations: MIGRATIONS,
  async start(ctx) {
    const dir = join(loadConfig().dataDir, 'library')
    const store = new LibraryStore(ctx.db)
    const downloads = new DownloadManager(store, dir, ctx, fetch, Number(ctx.settings.get(PARALLEL_KEY) ?? DEFAULT_PARALLEL))
    const guides = new GuideManager(ctx.db, join(dir, 'guides'), ctx)
    library = new Library(new KiwixClient(process.env.KIWIX_URL || 'http://kiwix:8080'), store, downloads, guides)
    await downloads.start()
    await guides.start()
  },
  stop() {
    library?.downloads.stop()
    library?.guides.stop()
    library = null
  },
}
