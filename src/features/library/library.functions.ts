import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { cleanArticle } from './article.server'
import { GUIDES_BOOK, GUIDES_TITLE, type GuidesData } from './guides/catalog'
import { DEFAULT_PARALLEL } from './downloads.server'
import { getLibraryReady, PARALLEL_KEY } from './server'
import { isAppBook } from './types'

const rawUrl = (contentId: string, path: string) => `/api/library/raw/${encodeURIComponent(contentId)}/${path.split('/').map(encodeURIComponent).join('/')}`
import type { ArticleResult, Book, CatalogEntry, CatalogPage, LibraryHome, Recommendation, SearchGroup, SearchResults, SourcesData, Suggestion } from './types'

async function lib() {
  if (!getPlatform().features.isEnabled('library')) throw new Error('The Library is switched off.')
  const library = await getLibraryReady()
  if (!library) throw new Error('The Library is still starting. Try again in a moment.')
  return library
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback)

export const getLibraryHome = createServerFn({ method: 'GET' }).handler(async (): Promise<LibraryHome> => {
  const library = await lib()
  const { online, books } = await library.booksOrOffline()
  return {
    online,
    books,
    history: library.store.history(8),
    saved: library.store.bookmarks(6),
    downloads: library.downloads.list().filter((d) => d.state !== 'done'),
    storage: await library.downloads.storage(),
  }
})

export const searchLibrary = createServerFn({ method: 'GET' })
  .validator((d: { q?: string; book?: string; start?: number }) => ({ q: str(d?.q, 200).trim(), book: str(d?.book, 200), start: num(d?.start) }))
  .handler(async ({ data }): Promise<SearchResults> => {
    const library = await lib()
    if (!data.q) return { query: '', groups: [], start: 0, pageLength: 0 }
    const books = await library.books()
    if (data.book) {
      const book = books.find((b) => b.contentId === data.book)
      if (!book) return { query: data.q, groups: [], start: 0, pageLength: 20 }
      const { total, hits } = book.contentId === GUIDES_BOOK ? library.guides.search(data.q, data.start, 20) : await library.kiwix.search(book.contentId, data.q, data.start, 20)
      return { query: data.q, groups: [{ contentId: book.contentId, bookTitle: book.title, total, hits: hits.map((h) => ({ ...h, bookTitle: book.title })) }], start: data.start, pageLength: 20 }
    }
    const groups = await Promise.all(
      books.slice(0, 12).map(async (book): Promise<SearchGroup> => {
        try {
          const { total, hits } = book.contentId === GUIDES_BOOK ? library.guides.search(data.q, 0, 5) : await library.kiwix.search(book.contentId, data.q, 0, 5)
          return { contentId: book.contentId, bookTitle: book.title, total, hits: hits.map((h) => ({ ...h, bookTitle: book.title })) }
        } catch {
          return { contentId: book.contentId, bookTitle: book.title, total: 0, hits: [] }
        }
      }),
    )
    return { query: data.q, groups: groups
        .filter((g) => g.total > 0)
        // The Australian guides first: they're short, local and usually what's wanted.
        .sort((a, b) => Number(b.contentId === GUIDES_BOOK) - Number(a.contentId === GUIDES_BOOK) || b.total - a.total), start: 0, pageLength: 5 }
  })

export const suggestLibrary = createServerFn({ method: 'GET' })
  .validator((d: { q?: string }) => ({ q: str(d?.q, 100).trim() }))
  .handler(async ({ data }): Promise<Suggestion[]> => {
    const library = await lib()
    if (data.q.length < 2) return []
    const books = (await library.booksOrOffline()).books.slice(0, 8)
    const lists = await Promise.all(
      books.map((b) =>
        (b.contentId === GUIDES_BOOK ? Promise.resolve(library.guides.suggest(data.q, 4)) : library.kiwix.suggest(b.contentId, data.q, 4))
          .then((l) => l.map((s) => ({ ...s, bookTitle: b.title })))
          .catch(() => [] as Suggestion[]),
      ),
    )
    // Interleave books, so one big book doesn't push the others out.
    const out: Suggestion[] = []
    for (let i = 0; out.length < 8 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < 8) out.push(l[i]!)
    return out
  })

export const getArticle = createServerFn({ method: 'GET' })
  .validator((d: { book: string; path?: string }) => ({ book: str(d?.book, 200), path: str(d?.path, 2000) }))
  .handler(async ({ data }): Promise<ArticleResult> => {
    const library = await lib()
    if (data.book === GUIDES_BOOK) {
      const result = await library.guides.article(data.path)
      if (result.kind === 'article' && data.path) {
        library.store.visit({ contentId: GUIDES_BOOK, path: data.path, title: result.title, bookTitle: GUIDES_TITLE })
        result.saved = library.store.isSaved(GUIDES_BOOK, data.path)
      }
      if (result.kind === 'file' && result.title) library.store.visit({ contentId: GUIDES_BOOK, path: data.path, title: result.title, bookTitle: GUIDES_TITLE })
      return result
    }
    const book = await library.book(data.book)
    if (!book) return { kind: 'missing', contentId: data.book, path: data.path, reason: "This book isn't in the library. It may have been removed or updated to a newer version." }
    // Map books are apps of their own; they open in their original layout.
    if (isAppBook(book) && !data.path) {
      const main = await library.kiwix.page(book.contentId, '')
      const path = main.location ?? 'index.html'
      return { kind: 'file', url: rawUrl(book.contentId, path), title: book.title, bookTitle: book.title }
    }
    let page = await library.kiwix.page(book.contentId, data.path)
    // Website copies (zimit) name folder pages with a trailing slash, which the
    // reader's address loses. Try again with it, and read the page as that path
    // so its relative links resolve from the folder.
    if (page.status === 404 && data.path && !data.path.endsWith('/')) {
      const withSlash = await library.kiwix.page(book.contentId, `${data.path}/`)
      if (withSlash.status !== 404) {
        page = withSlash
        data.path = `${data.path}/`
      }
    }
    if (page.status >= 300 && page.status < 400 && page.location !== null) {
      // A redirect to the same page with a slash added is handled above; don't loop on it.
      if (page.location.replace(/\/$/, '') !== data.path.replace(/\/$/, '')) return { kind: 'redirect', path: page.location }
      const loc = page.location
      page = await library.kiwix.page(book.contentId, loc)
      data.path = loc
    }
    if (page.status === 404) return { kind: 'missing', contentId: book.contentId, path: data.path, reason: `${book.title} has no page called “${data.path}”.` }
    if (!page.body) {
      if (page.status >= 200 && page.status < 300) return { kind: 'file', url: rawUrl(book.contentId, data.path), pdf: page.contentType.includes('pdf') }
      return { kind: 'missing', contentId: book.contentId, path: data.path, reason: `The library server answered ${page.status}.` }
    }
    const article = cleanArticle(page.body, book.contentId, data.path)
    const title = article.title || data.path.replace(/_/g, ' ') || book.title
    library.store.visit({ contentId: book.contentId, path: data.path, title, bookTitle: book.title })
    return {
      kind: 'article',
      contentId: book.contentId,
      bookTitle: book.title,
      path: data.path,
      title,
      html: article.html,
      toc: article.toc,
      words: article.words,
      saved: library.store.isSaved(book.contentId, data.path),
    }
  })

export const randomArticle = createServerFn({ method: 'POST' })
  .validator((d: { book?: string }) => ({ book: str(d?.book, 200) }))
  .handler(async ({ data }): Promise<{ book: string; path: string } | null> => {
    const library = await lib()
    const books = await library.books()
    if (data.book === GUIDES_BOOK) {
      const id = library.guides.random()
      return id ? { book: GUIDES_BOOK, path: id } : null
    }
    let book: Book | undefined = books.filter((b) => !isAppBook(b)).find((b) => b.contentId === data.book)
    const readable = books.filter((b) => !isAppBook(b))
    if (!book && readable.length) {
      // Bigger books come up more often, as they would on a shelf.
      let pick = Math.random() * readable.reduce((n, b) => n + Math.max(1, b.articleCount), 0)
      book = readable.find((b) => (pick -= Math.max(1, b.articleCount)) <= 0) ?? readable[0]
    }
    if (!book) return null
    if (book.contentId === GUIDES_BOOK) {
      const id = library.guides.random()
      return id ? { book: GUIDES_BOOK, path: id } : null
    }
    const path = await library.kiwix.random(book.contentId)
    return path === null ? null : { book: book.contentId, path }
  })

export const setBookmark = createServerFn({ method: 'POST' })
  .validator((d: { book: string; path: string; title: string; bookTitle: string; saved: boolean }) => ({
    contentId: str(d?.book, 200),
    path: str(d?.path, 2000),
    title: str(d?.title, 300),
    bookTitle: str(d?.bookTitle, 300),
    saved: d?.saved === true,
  }))
  .handler(async ({ data }) => {
    const { saved, ...page } = data
    const library = await lib()
    library.store.setSaved(page, saved)
    return { saved }
  })

export const getSaved = createServerFn({ method: 'GET' }).handler(async () => {
  const library = await lib()
  return { saved: library.store.bookmarks(), history: library.store.history() }
})

export const forgetHistory = createServerFn({ method: 'POST' })
  .validator((d: { book?: string; path?: string; all?: boolean }) => ({ book: str(d?.book, 200), path: str(d?.path, 2000), all: d?.all === true }))
  .handler(async ({ data }) => {
    const library = await lib()
    if (data.all) library.store.clearHistory()
    else library.store.removeHistory(data.book, data.path)
    return { ok: true }
  })

// Sources: what's installed, what's downloading, and what's available.

export const getSources = createServerFn({ method: 'GET' }).handler(async (): Promise<SourcesData> => {
  const library = await lib()
  const { online, books } = await library.booksOrOffline()
  return { online, books, downloads: library.downloads.list(), storage: await library.downloads.storage(), updates: {}, parallel: library.downloads.getParallel() }
})

export const setParallelDownloads = createServerFn({ method: 'POST' })
  .validator((d: { n: number }) => ({ n: typeof d?.n === 'number' ? d.n : DEFAULT_PARALLEL }))
  .handler(async ({ data }) => {
    const n = (await lib()).downloads.setParallel(data.n)
    getPlatform().settings.set(PARALLEL_KEY, String(n))
    return { parallel: n }
  })

export const getDownloads = createServerFn({ method: 'GET' }).handler(async () => {
  const library = await lib()
  const downloads = library.downloads.list()
  // A finished download shows up as a book once Kiwix has picked it up.
  if (downloads.some((d) => d.state === 'done')) library.forgetBooks()
  const { online, books } = await library.booksOrOffline()
  return { downloads, storage: await library.downloads.storage(), books, online, parallel: library.downloads.getParallel() }
})

/** Newer versions of installed books. Needs the internet; quietly empty without it. */
export const checkBookUpdates = createServerFn({ method: 'GET' }).handler(async (): Promise<Record<string, CatalogEntry>> => {
  const library = await lib()
  const out: Record<string, CatalogEntry> = {}
  const { books } = await library.booksOrOffline()
  await Promise.all(
    books.filter((b) => b.contentId !== GUIDES_BOOK).map(async (b) => {
      const newer = await library.catalog.newerThan(b.name, b.flavour, b.contentId).catch(() => null)
      if (newer) out[b.contentId] = newer
    }),
  )
  return out
})

export const getRecommended = createServerFn({ method: 'GET' }).handler(async (): Promise<{ ok: true; list: Recommendation[] } | { ok: false; error: string }> => {
  try {
    return { ok: true, list: await (await lib()).catalog.recommended() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

export const browseCatalog = createServerFn({ method: 'GET' })
  .validator((d: { q?: string; lang?: string; category?: string; start?: number }) => ({
    q: str(d?.q, 100),
    lang: d?.lang === '' ? '' : /^[a-z]{3}$/.test(str(d?.lang)) ? str(d?.lang) : 'eng',
    category: /^[\w-]{0,40}$/.test(str(d?.category)) ? str(d?.category) : '',
    start: num(d?.start),
  }))
  .handler(async ({ data }): Promise<{ ok: true; page: CatalogPage } | { ok: false; error: string }> => {
    try {
      return { ok: true, page: await (await lib()).catalog.browse(data) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

export const startDownload = createServerFn({ method: 'POST' })
  .validator((d: { name: string; contentId: string; replaces?: string }) => ({ name: str(d?.name, 200), contentId: str(d?.contentId, 200), replaces: str(d?.replaces, 200) || null }))
  .handler(async ({ data }) => {
    const library = await lib()
    // Look the file up again here rather than trusting a URL from the page.
    const entry = (await library.catalog.versions(data.name)).find((e) => e.contentId === data.contentId)
    if (!entry) throw new Error("Couldn't find that book in Kiwix's catalogue. It may have been replaced by a newer version.")
    return library.downloads.add(entry, data.replaces)
  })

export const controlDownload = createServerFn({ method: 'POST' })
  .validator((d: { id: number; action: 'pause' | 'resume' | 'cancel' }) => ({
    id: num(d?.id),
    action: (['pause', 'resume', 'cancel'] as const).includes(d?.action) ? d.action : 'pause',
  }))
  .handler(async ({ data }) => {
    const { downloads } = await lib()
    if (data.action === 'pause') downloads.pause(data.id)
    else if (data.action === 'resume') downloads.resume(data.id)
    else await downloads.cancel(data.id)
    return { ok: true }
  })

export const removeBook = createServerFn({ method: 'POST' })
  .validator((d: { contentId: string }) => ({ contentId: str(d?.contentId, 200) }))
  .handler(async ({ data }) => {
    const library = await lib()
    await library.removeBook(data.contentId)
    return { ok: true }
  })

// Australian guides

export const getGuides = createServerFn({ method: 'GET' }).handler(async (): Promise<GuidesData> => (await lib()).guides.list())

export const saveGuides = createServerFn({ method: 'POST' })
  .validator((d: { ids: string[] }) => ({ ids: Array.isArray(d?.ids) ? d.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [] }))
  .handler(async ({ data }) => {
    const library = await lib()
    library.guides.enqueue(data.ids)
    return library.guides.list()
  })

export const removeGuide = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 100) }))
  .handler(async ({ data }) => {
    const library = await lib()
    await library.guides.remove(data.id)
    return library.guides.list()
  })

export const refreshGuides = createServerFn({ method: 'POST' }).handler(async () => {
  const library = await lib()
  library.guides.refreshAll()
  return library.guides.list()
})
