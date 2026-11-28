import type { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Parser } from 'htmlparser2'
import type { SettingsStore } from '#/platform/server/settings.server'
import { extractTitle, resolveLink } from './article.server'
import { GUIDES_BOOK, guide } from './guides/catalog'
import { TOPICS, topic as findTopic, type Discover, type Preview, type TopicReads, type TopicSummary } from './hub'
import type { Library } from './server'
import { isAppBook, type Book, type SearchHit } from './types'

/** Settings key for the day's picks. */
export const DISCOVER_KEY = 'library.discover'

/** Reading lists are rebuilt after this long, or when the shelves change. */
const READS_TTL_MS = 12 * 60 * 60 * 1000
const PREVIEW_LEN = 220

const rawUrl = (contentId: string, rest: string) => `/api/library/raw/${encodeURIComponent(contentId)}/${rest}`

/** Wiki pages that aren't articles: categories, files, templates and the like. */
const NOT_ARTICLE = /^(Category|File|Template|Help|Portal|Wikipedia|Special|Talk|User|Module|MediaWiki|Draft|Book)(:|%3A)/i

export function isArticlePath(path: string): boolean {
  if (!path || NOT_ARTICLE.test(path)) return false
  if (/\.(css|js|json|png|jpe?g|gif|svg|webp|ico|woff2?|xml|txt)$/i.test(path)) return false
  if (/(^|\/)(_assets_|_res_|-\/)/.test(path)) return false
  // Website copies: listings of tags, categories, authors and pages of posts aren't articles.
  return !/(^|\/)(tags?|categor(y|ies)|authors?|page)(\/|$)/i.test(path)
}

/** Fine as an article but not as a pick of the day: site news and blog posts. */
const NOT_A_PICK = /(^|\/)(blog|news|changelog|about|contact|privacy)(\/|$)|^(Tag|Category|Author|Archive)s?:/i

/** Cuts text to about `max` characters, at a word, with an ellipsis. */
export function clip(text: string, max = PREVIEW_LEN): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sentence = cut.lastIndexOf('. ')
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.7)).replace(/[,;:\s]+$/, '')}…`
}

/** Elements whose text isn't the article's opening: boxes, notes, references, page furniture. */
const SKIP = new Set(['table', 'style', 'script', 'noscript', 'nav', 'header', 'footer', 'figure', 'figcaption', 'sup', 'aside', 'form', 'button', 'template', 'svg', 'math'])
const SKIP_CLASSES = new Set(['metadata', 'mw-empty-elt', 'noprint', 'thumbcaption', 'reflist', 'shortdescription', 'toc', 'mw-editsection', 'breadcrumb', 'breadcrumbs', 'menu'])
const SKIP_PREFIX = /^(hatnote|navbox|infobox|ambox|sidebar|mbox)/
/** Whole class names only: `vector-feature-main-menu-disabled` on <html> isn't a menu. */
const skipClass = (cls: string | undefined) => !!cls && cls.split(/\s+/).some((c) => SKIP_CLASSES.has(c) || SKIP_PREFIX.test(c))

/**
 * The picture and opening lines of a page from a book. The picture is the
 * page's own lead image (its og:image, or the first sizeable picture), the
 * text its description or first real paragraph.
 */
export function extractPreview(raw: string, contentId: string, path: string): { title: string; excerpt: string; image: string | null } {
  const title = extractTitle(raw)
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i')
    const tag = re.exec(raw)?.[0]
    return tag ? (/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').trim() : ''
  }
  const toRaw = (src: string): string | null => {
    if (!src || src.startsWith('data:')) return null
    const link = resolveLink(src, contentId, path)
    return link?.kind === 'internal' ? rawUrl(link.contentId, link.rest) : null
  }

  const og = meta('og:image')
  let image: string | null = /icon|logo|favicon/i.test(og) ? null : toRaw(og)
  const paragraphs: string[] = []
  const items: string[] = []
  let inLi = false
  let liBuf = ''
  let skipDepth = 0
  const stack: boolean[] = []
  let inP = false
  let buf = ''
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const skip = SKIP.has(name) || skipClass(attrs.class) || attrs.hidden !== undefined || /display:\s*none/.test(attrs.style ?? '')
        // htmlparser2 closes every tag, void ones included, so the stack stays balanced.
        stack.push(skip)
        if (skip) skipDepth++
        if (name === 'p' && skipDepth === 0) {
          inP = true
          buf = ''
        }
        if (name === 'li' && skipDepth === 0 && !inLi) {
          inLi = true
          liBuf = ''
        }
        if (name === 'img' && !image) {
          // Lead pictures in Wikipedia's infobox count, even though its text doesn't.
          const w = Number(attrs.width ?? attrs['data-file-width'] ?? 0)
          const h = Number(attrs.height ?? attrs['data-file-height'] ?? 0)
          const src = attrs.src ?? ''
          const drawing = attrs['data-file-type'] === 'drawing' || /\.svg($|\?)/i.test(src) || /icon|logo|sprite|badge|flag/i.test(`${src} ${attrs.class ?? ''}`)
          const big = (w === 0 && h === 0) || (w >= 120 && (h === 0 || h >= 80))
          if (!drawing && big) image = toRaw(src)
        }
      },
      ontext(text) {
        if (inP && skipDepth === 0) buf += text
        if (inLi && skipDepth === 0) liBuf += text
      },
      onclosetag(name) {
        if (name === 'p' && inP) {
          inP = false
          const t = buf.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()
          if (t) paragraphs.push(t)
        }
        if (name === 'li' && inLi) {
          inLi = false
          const t = liBuf.replace(/\s+/g, ' ').trim()
          if (t && t.length <= 90 && items.length < 10) items.push(t)
        }
        if (stack.pop()) skipDepth--
      },
    },
    { decodeEntities: true },
  )
  parser.write(raw)
  parser.end()

  const description = meta('og:description') || meta('description')
  const opening = paragraphs.find((p) => p.length >= 60) ?? paragraphs.find((p) => p.length >= 20) ?? ''
  // Site descriptions are often the same on every page; a real paragraph is better when there is one.
  // Recipes and how-tos are mostly lists: their first items say more than a one-line description.
  const fromList = items.length >= 3 ? [description.replace(/\.$/, ''), items.join(' · ')].filter(Boolean).join('. ') : ''
  const excerpt = clip(opening.length >= 60 ? opening : fromList || description || opening)
  return { title, excerpt, image }
}

interface PreviewRow {
  content_id: string
  path: string
  title: string
  excerpt: string
  image: string | null
  pdf: number
}

/** How many things run at once against Kiwix. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

function today(now = Date.now()): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Builds the hub from whatever's installed: previews of pages (kept in the
 * database, since a book's pages never change), reading lists for each topic,
 * and the day's picks.
 */
export class Hub {
  private reads = new Map<string, { sig: string; at: number; data: TopicReads }>()
  private building = new Map<string, Promise<TopicReads>>()

  constructor(
    private readonly library: Library,
    private readonly db: DatabaseSync,
    private readonly settings: SettingsStore,
    private readonly guidesDir: string,
  ) {}

  private readable(books: Book[]): Book[] {
    return books.filter((b) => !isAppBook(b))
  }

  private sig(books: Book[]): string {
    return books.map((b) => b.contentId).join('|')
  }

  /** A card for a page, from the database or made now. Null when it isn't an article. */
  async preview(book: Pick<Book, 'contentId' | 'title'>, path: string): Promise<Preview | null> {
    const cached = this.db.prepare('SELECT * FROM library_previews WHERE content_id = ? AND path = ?').get(book.contentId, path) as PreviewRow | undefined
    if (cached) return cached.title ? this.fromRow(cached, book.title) : null
    let p: Omit<PreviewRow, 'content_id' | 'path'> | null = null
    try {
      p = book.contentId === GUIDES_BOOK ? await this.guidePreview(path) : await this.pagePreview(book.contentId, path)
    } catch {
      // Kiwix busy or the page unreadable; try again another time rather than remembering a blank.
      return null
    }
    this.db
      .prepare('INSERT OR REPLACE INTO library_previews (content_id, path, title, excerpt, image, pdf, made_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(book.contentId, path, p?.title ?? '', p?.excerpt ?? '', p?.image ?? null, p?.pdf ?? 0, Date.now())
    return p ? this.fromRow({ ...p, content_id: book.contentId, path }, book.title) : null
  }

  private fromRow(r: PreviewRow, bookTitle: string): Preview {
    return { contentId: r.content_id, bookTitle, path: r.path, title: r.title, excerpt: r.excerpt, image: r.image, ...(r.pdf ? { pdf: true } : {}) }
  }

  private async pagePreview(contentId: string, path: string): Promise<Omit<PreviewRow, 'content_id' | 'path'> | null> {
    let page = await this.library.readPage(contentId, path)
    if (page.kind === 'redirect') page = await this.library.readPage(contentId, page.path)
    if (page.kind === 'file' && page.pdf) return { title: path.split('/').pop()!.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '), excerpt: '', image: null, pdf: 1 }
    if (page.kind !== 'page') return null
    const p = extractPreview(page.body, contentId, page.path)
    if (!p.title && !p.excerpt) return null
    return { title: p.title || path.replace(/_/g, ' '), excerpt: p.excerpt, image: p.image, pdf: 0 }
  }

  private async guidePreview(id: string): Promise<Omit<PreviewRow, 'content_id' | 'path'> | null> {
    const g = guide(id)
    if (!g) return null
    let image: string | null = null
    if (g.kind === 'page') {
      const html = await readFile(join(this.guidesDir, `${g.id}.html`), 'utf8').catch(() => '')
      image = /<img[^>]+src="([^"]+)"/i.exec(html)?.[1] ?? null
    }
    return { title: g.title, excerpt: clip(g.summary), image, pdf: g.kind === 'pdf' ? 1 : 0 }
  }

  /** Previews for pages, skipping any that can't be read. */
  async previews(items: { contentId: string; path: string }[]): Promise<Preview[]> {
    const books = new Map((await this.library.books()).map((b) => [b.contentId, b]))
    const out = await pool(items, 4, async (i) => {
      const b = books.get(i.contentId)
      return b ? this.preview(b, i.path) : null
    })
    return out.filter((p): p is Preview => p !== null)
  }

  /**
   * A topic's reading list: the best page for each of its questions, from
   * every book. Pages from books about the topic count even when only their
   * text mentions it; from other books, the title has to.
   */
  async topic(id: string): Promise<TopicReads | null> {
    const t = findTopic(id)
    if (!t) return null
    const books = this.readable(await this.library.books())
    const sig = this.sig(books)
    const hit = this.reads.get(id)
    if (hit && hit.sig === sig && Date.now() - hit.at < READS_TTL_MS) return hit.data
    const key = `${id}:${sig}`
    const running = this.building.get(key)
    if (running) return running
    const job = this.buildTopic(id, books).finally(() => this.building.delete(key))
    this.building.set(key, job)
    const data = await job
    this.reads.set(id, { sig, at: Date.now(), data })
    return data
  }

  private async buildTopic(id: string, books: Book[]): Promise<TopicReads> {
    const t = findTopic(id)!
    const about = (b: Book) => t.books.test(`${b.name} ${b.title} ${b.contentId}`)
    const ordered = [...books.filter(about), ...books.filter((b) => !about(b))].slice(0, 10)
    // Whole words, plurals allowed: "burns" finds "Burn" but not "Burning Noodles".
    const titleHas = (title: string, q: string) =>
      q
        .toLowerCase()
        .split(/\s+/)
        .every((w) => new RegExp(`\\b${w.replace(/(es|s)$/, '').replace(/[^a-z0-9]/g, '')}(s|es)?\\b`, 'i').test(title))
    type Candidate = { hit: SearchHit; score: number }
    const perQuery = await pool(t.queries, 3, async (q): Promise<Candidate[]> => {
      const found: Candidate[] = []
      for (const b of ordered) {
        let hits: SearchHit[] = []
        try {
          hits = b.contentId === GUIDES_BOOK ? this.library.guides.search(q, 0, 2).hits : (await this.library.kiwix.search(b.contentId, q, 0, 3)).hits
        } catch {
          continue
        }
        hits.forEach((h, rank) => {
          if (!isArticlePath(h.path) && b.contentId !== GUIDES_BOOK) return
          const inTitle = titleHas(h.title, q)
          if (!inTitle && !about(b)) return
          found.push({ hit: { ...h, bookTitle: b.title }, score: (inTitle ? 4 : 0) + (about(b) ? 2 : 0) + (b.contentId === GUIDES_BOOK ? 2 : 0) - rank })
        })
      }
      return found.sort((a, b) => b.score - a.score).slice(0, 2)
    })
    // One from each question first, then seconds, so the list covers the topic.
    const seen = new Set<string>()
    const picks: SearchHit[] = []
    for (const round of [0, 1]) {
      for (const list of perQuery) {
        const c = list[round]
        if (!c) continue
        const k = `${c.hit.contentId}/${c.hit.path}`
        const tk = `${c.hit.contentId}:${c.hit.title.toLowerCase()}`
        if (seen.has(k) || seen.has(tk)) continue
        seen.add(k)
        seen.add(tk)
        picks.push(c.hit)
      }
    }
    const reads = (await this.previews(picks.slice(0, 14).map((h) => ({ contentId: h.contentId, path: h.path })))).filter((p) => p.title)
    // Lead with a read that has a picture, when one does.
    const pictured = reads.findIndex((p) => p.image)
    if (pictured > 0) reads.unshift(...reads.splice(pictured, 1))
    return {
      topic: id,
      reads,
      books: books.filter(about).map((b) => ({ contentId: b.contentId, title: b.title, uuid: b.uuid })),
      builtAt: Date.now(),
    }
  }

  /** Every topic's tile: how many reads, and pictures from the first few. */
  async summaries(): Promise<TopicSummary[]> {
    const all = await pool(TOPICS, 2, (t) => this.topic(t.id).catch(() => null))
    return all.map((r, i) => ({
      id: TOPICS[i]!.id,
      count: r?.reads.length ?? 0,
      images: (r?.reads ?? []).map((p) => p.image).filter((x): x is string => !!x).slice(0, 3),
    }))
  }

  /**
   * The day's picks: articles from across the shelves, the same all day for
   * everyone at home, with pictures first. `fresh` picks again.
   */
  async discover(fresh = false, budgetMs = 6000): Promise<Discover> {
    const books = this.readable(await this.library.books())
    const sig = this.sig(books)
    const day = today()
    const cached = this.settings.getJson<Discover & { sig: string }>(DISCOVER_KEY)
    if (!fresh && cached && cached.day === day && cached.sig === sig && cached.items.length) return { day, items: cached.items }
    if (!books.length) return { day, items: [] }

    const until = Date.now() + budgetMs
    const want = 7
    const items: Preview[] = []
    const seen = new Set<string>()
    // Take turns between books so a big encyclopedia doesn't crowd out the cookbook.
    const order = [...books].sort(() => Math.random() - 0.5)
    const cap = Math.ceil(want / Math.min(order.length, 3))
    // First pass shares the picks between books; the second fills any gaps from whichever books have good pages.
    for (const capped of [true, false]) {
      for (let i = 0; i < want * 4 && items.length < want && Date.now() < until; i++) {
        const book = order[i % order.length]!
        if (capped && items.filter((p) => p.contentId === book.contentId).length >= cap) continue
        let path: string | null = null
        try {
          path = book.contentId === GUIDES_BOOK ? this.library.guides.random() : await this.library.kiwix.random(book.contentId)
        } catch {
          continue
        }
        if (!path || seen.has(`${book.contentId}/${path}`) || (book.contentId !== GUIDES_BOOK && !isArticlePath(path)) || NOT_A_PICK.test(path)) continue
        seen.add(`${book.contentId}/${path}`)
        const p = await this.preview(book, path)
        if (!p || p.pdf || NOT_A_PICK.test(p.title) || p.excerpt.length < (book.contentId === GUIDES_BOOK ? 30 : 80)) continue
        items.push(p)
      }
    }
    items.sort((a, b) => Number(!!b.image) - Number(!!a.image))
    if (items.length) this.settings.setJson(DISCOVER_KEY, { day, sig, items })
    return { day, items }
  }

  /** Forget reading lists, so they're rebuilt with the new shelves. */
  forget(): void {
    this.reads.clear()
  }
}

