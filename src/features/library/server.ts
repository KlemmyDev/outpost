import { join } from 'node:path'
import { loadConfig } from '#/platform/server/config.server'
import { getPlatform } from '#/platform/server/platform.server'
import type { FeatureServer } from '#/platform/server/runtime.server'
import { Catalog } from './catalog.server'
import { DEFAULT_PARALLEL, DownloadManager } from './downloads.server'
import { GuideManager } from './guides/guides.server'
import { Hub } from './hub.server'
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
  /** The hub's topics and picks; set once the Library starts. */
  hub!: Hub
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
    this.store.forgetPreviews(contentId)
    this.removed.set(contentId, Date.now() + 60_000)
    this.bookCache = null
  }

  /**
   * A page from a book, following Kiwix's redirects. Website copies (zimit)
   * name folder pages with a trailing slash, which readers' addresses lose, so
   * a missing page is tried again with one; the page is then read as that
   * path, so its relative links resolve from the folder.
   */
  async readPage(
    contentId: string,
    path: string,
  ): Promise<{ kind: 'page'; path: string; body: string } | { kind: 'redirect'; path: string } | { kind: 'file'; path: string; pdf: boolean } | { kind: 'missing'; path: string; status: number }> {
    let page = await this.kiwix.page(contentId, path)
    if (page.status === 404 && path && !path.endsWith('/')) {
      const withSlash = await this.kiwix.page(contentId, `${path}/`)
      if (withSlash.status !== 404) {
        page = withSlash
        path = `${path}/`
      }
    }
    if (page.status >= 300 && page.status < 400 && page.location !== null) {
      // A redirect to the same page with a slash added is handled here; don't loop on it.
      if (page.location.replace(/\/$/, '') !== path.replace(/\/$/, '')) return { kind: 'redirect', path: page.location }
      path = page.location
      page = await this.kiwix.page(contentId, path)
    }
    if (page.body) return { kind: 'page', path, body: page.body }
    if (page.status >= 200 && page.status < 300) return { kind: 'file', path, pdf: page.contentType.includes('pdf') }
    return { kind: 'missing', path, status: page.status }
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
    library.hub = new Hub(library, ctx.db, ctx.settings, join(dir, 'guides'))
    await downloads.start()
    await guides.start()
  },
  stop() {
    library?.downloads.stop()
    library?.guides.stop()
    library = null
  },
}
