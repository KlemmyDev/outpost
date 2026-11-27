import { join } from 'node:path'
import { loadConfig } from '#/platform/server/config.server'
import { getPlatform } from '#/platform/server/platform.server'
import type { FeatureServer } from '#/platform/server/runtime.server'
import { Catalog } from './catalog.server'
import { DownloadManager } from './downloads.server'
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
  ) {}

  /** Installed books, alphabetical. Cached for a few seconds, since every page asks. */
  async books(): Promise<Book[]> {
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
      return { online: false, books: [] }
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
    const downloads = new DownloadManager(store, dir, ctx)
    library = new Library(new KiwixClient(process.env.KIWIX_URL || 'http://kiwix:8080'), store, downloads)
    await downloads.start()
  },
  stop() {
    library?.downloads.stop()
    library = null
  },
}
