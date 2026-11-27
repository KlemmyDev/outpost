import { parseLocalCatalog, parseSearch } from './opds'
import { encodePath } from './article.server'
import type { Book, SearchHit, Suggestion } from './types'

export class KiwixError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15_000

/**
 * Talks to kiwix-serve, the sidecar that reads the ZIM files. It runs in its
 * own container (see docker/kiwix.sh) and is only reached through Outpost.
 */
export class KiwixClient {
  constructor(readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(this.url(path), { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) })
    } catch (err) {
      throw new KiwixError(`The library server isn't answering (${(err as Error).message}).`, 503)
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.url('/catalog/v2/root.xml'), { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** The books Kiwix is serving. Sizes come from the files, so they're left out here. */
  async books(): Promise<Omit<Book, 'sizeBytes'>[]> {
    const res = await this.fetch('/catalog/v2/entries?count=-1')
    if (!res.ok) throw new KiwixError(`The library server answered ${res.status}.`)
    return parseLocalCatalog(await res.text())
  }

  async search(contentId: string, pattern: string, start = 0, pageLength = 10): Promise<{ total: number; hits: SearchHit[] }> {
    const q = new URLSearchParams({ content: contentId, pattern, format: 'xml', start: String(start), pageLength: String(pageLength) })
    const res = await this.fetch(`/search?${q}`)
    // A book without a full-text index can't be searched; that's not an error worth showing.
    if (res.status === 400 || res.status === 404) return { total: 0, hits: [] }
    if (!res.ok) throw new KiwixError(`Search failed (${res.status}).`)
    return parseSearch(await res.text(), contentId)
  }

  /** Titles starting with what's been typed so far. */
  async suggest(contentId: string, term: string, count = 6): Promise<Omit<Suggestion, 'bookTitle'>[]> {
    const q = new URLSearchParams({ content: contentId, term, count: String(count) })
    const res = await this.fetch(`/suggest?${q}`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return []
    const list = (await res.json()) as { value: string; kind: string; path?: string }[]
    return list.filter((s) => s.kind === 'path' && s.path).map((s) => ({ contentId, title: s.value, path: s.path! }))
  }

  /** A random article's path. */
  async random(contentId: string): Promise<string | null> {
    const res = await this.fetch(`/random?content=${encodeURIComponent(contentId)}`, { redirect: 'manual' })
    const loc = res.headers.get('location')
    return loc ? pathFromContentUrl(loc, contentId) : null
  }

  /**
   * A page from a book. Redirects aren't followed, so the reader's address
   * can move to the real path. An empty path is the book's main page.
   */
  async page(contentId: string, path: string): Promise<{ status: number; location: string | null; contentType: string; body: string | null }> {
    const res = await this.fetch(`/content/${encodeURIComponent(contentId)}/${encodePath(path)}`, { redirect: 'manual' })
    const contentType = res.headers.get('content-type') ?? ''
    const location = res.headers.get('location')
    const isHtml = contentType.includes('text/html')
    const body = res.ok && isHtml ? await res.text() : null
    if (!body) await res.body?.cancel()
    return { status: res.status, location: location ? pathFromContentUrl(location, contentId) : null, contentType, body }
  }

  /** A file from inside a book, as stored, for pictures and downloads. `rest` is already URL-encoded. */
  raw(contentId: string, rest: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(`/raw/${encodeURIComponent(contentId)}/content/${rest}`, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) })
  }

  illustration(uuid: string, size = 48): Promise<Response> {
    return this.fetch(`/catalog/v2/illustration/${encodeURIComponent(uuid)}/?size=${size}`)
  }
}

/** `/content/<id>/<path>` (absolute or not) to the decoded path inside the book. */
export function pathFromContentUrl(location: string, contentId: string): string | null {
  let pathname: string
  try {
    pathname = new URL(location, 'http://kiwix.invalid').pathname
  } catch {
    return null
  }
  const prefix = `/content/${encodeURIComponent(contentId)}/`
  const alt = `/content/${contentId}/`
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.startsWith(alt) ? pathname.slice(alt.length) : null
  if (rest === null) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}
