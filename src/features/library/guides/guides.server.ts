import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { FeatureContext } from '#/platform/server/runtime.server'
import { buildToc, plainText } from '../article.server'
import type { ArticleResult, Book, SearchHit, Suggestion } from '../types'
import { GUIDE_HOSTS, GUIDE_TOPICS, GUIDES, GUIDES_BOOK, GUIDES_TITLE, guide, type GuideSource, type GuideState, type GuidesData } from './catalog'
import { extractGuidePage } from './extract.server'

// No URL in it: some publishers' CDNs (Akamai, for Eat For Health) drop requests whose user agent has one.
const UA = 'Mozilla/5.0 (compatible; Outpost offline library)'
const MAX_PDF = 80 * 1024 * 1024
const MAX_PAGE = 5 * 1024 * 1024
const MAX_IMAGE = 8 * 1024 * 1024
/** Saved guides are checked for a newer version this often. */
export const REFRESH_EVERY_MS = 30 * 24 * 60 * 60 * 1000

interface Row {
  id: string
  source_url: string
  bytes: number
  sha256: string
  etag: string | null
  last_modified: string | null
  page_title: string | null
  text: string
  fetched_at: number
  checked_at: number
}

export class GuideError extends Error {}

/**
 * Fetches Australian guides from their publishers, one at a time, and keeps
 * them in `<library>/guides`: PDFs as published, web pages cleaned into
 * reader HTML with their pictures beside them. Only hosts in the curated list
 * are ever contacted. Saved guides are rechecked monthly, with conditional
 * requests so unchanged ones aren't downloaded again.
 */
export class GuideManager {
  private queue: string[] = []
  private current: string | null = null
  private errors = new Map<string, string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  constructor(
    private readonly db: DatabaseSync,
    readonly dir: string,
    private readonly ctx: Pick<FeatureContext, 'notify' | 'log'>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    await mkdir(this.dir, { recursive: true, mode: 0o755 })
    const tick = () => {
      const due = this.rows().filter((r) => Date.now() - r.checked_at > REFRESH_EVERY_MS)
      if (due.length) this.enqueue(due.map((r) => r.id))
    }
    tick()
    this.timer = setInterval(tick, 24 * 60 * 60 * 1000)
    this.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    this.queue = []
    if (this.timer) clearInterval(this.timer)
  }

  private rows(): Row[] {
    return this.db.prepare('SELECT * FROM library_guides').all() as unknown as Row[]
  }

  private row(id: string): Row | null {
    return (this.db.prepare('SELECT * FROM library_guides WHERE id = ?').get(id) as unknown as Row | undefined) ?? null
  }

  list(): GuidesData {
    const rows = new Map(this.rows().map((r) => [r.id, r]))
    const guides: GuideState[] = GUIDES.map((g) => {
      const r = rows.get(g.id)
      return {
        id: g.id,
        title: g.title,
        summary: g.summary,
        topic: g.topic,
        publisher: g.publisher,
        kind: g.kind,
        url: g.url,
        approxBytes: g.approxBytes,
        bytes: r?.bytes ?? null,
        fetchedAt: r?.fetched_at ?? null,
        checkedAt: r?.checked_at ?? null,
        error: this.errors.get(g.id) ?? null,
        busy: this.current === g.id || this.queue.includes(g.id),
      }
    })
    const installed = guides.filter((g) => g.bytes !== null)
    return { guides, installed: installed.length, installedBytes: installed.reduce((n, g) => n + (g.bytes ?? 0), 0) }
  }

  /** Queues guides to fetch (or recheck), in the order given. */
  enqueue(ids: string[]): void {
    for (const id of ids) {
      if (!guide(id)) continue
      this.errors.delete(id)
      if (this.current !== id && !this.queue.includes(id)) this.queue.push(id)
    }
    void this.pump()
  }

  /** Rechecks every saved guide now. */
  refreshAll(): void {
    this.enqueue(this.rows().map((r) => r.id))
  }

  async remove(id: string): Promise<void> {
    const g = guide(id)
    if (!g) throw new GuideError('No such guide.')
    this.queue = this.queue.filter((q) => q !== id)
    await rm(join(this.dir, `${id}.pdf`), { force: true })
    await rm(join(this.dir, `${id}.html`), { force: true })
    await rm(join(this.dir, id), { recursive: true, force: true })
    this.db.prepare('DELETE FROM library_guides WHERE id = ?').run(id)
    this.errors.delete(id)
  }

  private async pump(): Promise<void> {
    if (this.current || this.stopped) return
    const id = this.queue.shift()
    if (!id) return
    this.current = id
    try {
      await this.fetchGuide(guide(id)!)
    } catch (err) {
      const message = (err as Error).message
      this.errors.set(id, message)
      this.ctx.log(`guide ${id}: ${message}`)
    } finally {
      this.current = null
      void this.pump()
    }
  }

  private async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    if (!GUIDE_HOSTS.has(new URL(url).hostname)) throw new GuideError(`Not an allowed source: ${new URL(url).hostname}`)
    let res: Response
    try {
      res = await this.fetchImpl(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(60_000) })
    } catch {
      throw new GuideError("Couldn't reach the publisher. Saving guides needs the internet.")
    }
    return res
  }

  private async readCapped(res: Response, max: number): Promise<Buffer> {
    const len = Number(res.headers.get('content-length'))
    if (len > max) throw new GuideError('The file is larger than expected, so it was skipped.')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > max) throw new GuideError('The file is larger than expected, so it was skipped.')
    return buf
  }

  /** Finds a PDF's current address on the page that links to it, when the old one has moved. */
  private async discover(g: GuideSource): Promise<string | null> {
    if (!g.discover) return null
    const res = await this.get(g.discover.page)
    if (!res.ok) return null
    const html = await res.text()
    for (const m of html.matchAll(/href="([^"]+)"/gi)) {
      const href = m[1]!.replace(/&amp;/g, '&')
      if (!href.includes(g.discover.match)) continue
      try {
        const url = new URL(href, g.discover.page)
        if (url.protocol === 'https:' && GUIDE_HOSTS.has(url.hostname)) return url.toString()
      } catch {
        // Not a URL; keep looking.
      }
    }
    return null
  }

  private async fetchGuide(g: GuideSource): Promise<void> {
    const prev = this.row(g.id)
    const conditional: Record<string, string> = {}
    if (prev?.etag) conditional['If-None-Match'] = prev.etag
    if (prev?.last_modified) conditional['If-Modified-Since'] = prev.last_modified

    let url = prev?.source_url ?? g.url
    let res = await this.get(url, conditional)
    if (res.status === 304 && prev) {
      this.db.prepare('UPDATE library_guides SET checked_at = ? WHERE id = ?').run(Date.now(), g.id)
      return
    }
    const looksWrong = !res.ok || (g.kind === 'pdf' && !(res.headers.get('content-type') ?? '').includes('pdf'))
    if (looksWrong) {
      await res.body?.cancel()
      const found = await this.discover(g)
      if (!found) throw new GuideError(`The publisher answered ${res.status}, and the guide couldn't be found on their site.`)
      url = found
      res = await this.get(url)
      if (!res.ok) throw new GuideError(`The publisher answered ${res.status}.`)
    }

    const etag = res.headers.get('etag')
    const lastModified = res.headers.get('last-modified')
    let bytes: number
    let sha: string
    let text = ''
    let pageTitle: string | null = null

    if (g.kind === 'pdf') {
      const buf = await this.readCapped(res, MAX_PDF)
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new GuideError("The publisher sent something that isn't a PDF.")
      sha = createHash('sha256').update(buf).digest('hex')
      bytes = buf.length
      if (prev?.sha256 !== sha) await this.writeAtomic(join(this.dir, `${g.id}.pdf`), buf)
    } else {
      const raw = (await this.readCapped(res, MAX_PAGE)).toString('utf8')
      const page = extractGuidePage(raw, res.url || url, g.selector ?? 'main', g.id)
      if (page.text.length < 200) throw new GuideError("The publisher's page didn't have the guide on it. Their site may have changed.")
      const imgDir = join(this.dir, g.id)
      await rm(imgDir, { recursive: true, force: true })
      await mkdir(imgDir, { recursive: true, mode: 0o755 })
      bytes = Buffer.byteLength(page.html)
      for (const img of page.images) {
        try {
          if (!GUIDE_HOSTS.has(new URL(img.url).hostname)) continue
          const r = await this.get(img.url)
          if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) continue
          const buf = await this.readCapped(r, MAX_IMAGE)
          await this.writeAtomic(join(imgDir, img.name), buf)
          bytes += buf.length
        } catch {
          // A missing picture shouldn't lose the guide.
        }
      }
      await this.writeAtomic(join(this.dir, `${g.id}.html`), Buffer.from(page.html))
      sha = createHash('sha256').update(page.html).digest('hex')
      text = page.text
      pageTitle = page.pageTitle
    }

    const now = Date.now()
    this.db
      .prepare(
        `INSERT OR REPLACE INTO library_guides (id, source_url, bytes, sha256, etag, last_modified, page_title, text, fetched_at, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(g.id, url, bytes, sha, etag, lastModified, pageTitle, text, prev && prev.sha256 === sha ? prev.fetched_at : now, now)
    if (prev && prev.sha256 !== sha) this.ctx.log(`guide ${g.id}: updated`)
  }

  private async writeAtomic(path: string, data: Buffer): Promise<void> {
    const tmp = `${path}.tmp`
    await writeFile(tmp, data)
    await chmod(tmp, 0o644).catch(() => {})
    await rename(tmp, path)
  }

  // The guides as a book in the Library.

  book(): Book | null {
    const { installed, installedBytes, guides } = this.list()
    if (installed === 0) return null
    const latest = Math.max(...guides.map((g) => g.fetchedAt ?? 0))
    return {
      contentId: GUIDES_BOOK,
      name: GUIDES_BOOK,
      flavour: '',
      title: GUIDES_TITLE,
      summary: 'First aid, emergency and healthy eating guides from Australian authorities.',
      language: 'eng',
      category: 'guides',
      articleCount: installed,
      mediaCount: 0,
      date: new Date(latest).toISOString().slice(0, 10),
      sizeBytes: installedBytes,
      uuid: '',
      pictures: true,
    }
  }

  async article(path: string): Promise<ArticleResult> {
    const base = { contentId: GUIDES_BOOK, bookTitle: GUIDES_TITLE, saved: false }
    if (!path) {
      const html = this.indexHtml()
      return { kind: 'article', ...base, path: '', title: GUIDES_TITLE, html, toc: [], words: plainText(html).split(' ').length }
    }
    const g = guide(path)
    const row = g ? this.row(g.id) : null
    if (!g || !row) return { kind: 'missing', contentId: GUIDES_BOOK, path, reason: "That guide isn't saved on this server. Save it from Library › Sources." }
    if (g.kind === 'pdf') {
      return { kind: 'file', url: `/api/library/guides/${g.id}.pdf`, title: g.title, bookTitle: GUIDES_TITLE, pdf: true, source: { publisher: g.publisher, url: row.source_url, fetchedAt: row.fetched_at } }
    }
    const html = await readFile(join(this.dir, `${g.id}.html`), 'utf8').catch(() => null)
    if (html === null) return { kind: 'missing', contentId: GUIDES_BOOK, path, reason: "The saved copy is missing. Save it again from Library › Sources." }
    return {
      kind: 'article',
      ...base,
      path,
      title: g.title,
      html,
      toc: buildToc(html),
      words: row.text.split(/\s+/).length,
      source: { publisher: g.publisher, url: row.source_url, fetchedAt: row.fetched_at },
    }
  }

  /** The book's main page: every saved guide, by topic. */
  private indexHtml(): string {
    const saved = new Set(this.rows().map((r) => r.id))
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    let out = '<p>Saved from Australian authorities for use offline. PDFs open as published; web pages keep their text with Outpost\'s layout. Each links back to its source.</p>'
    for (const topic of GUIDE_TOPICS) {
      const list = GUIDES.filter((g) => g.topic === topic && saved.has(g.id))
      if (!list.length) continue
      out += `<h2 id="${esc(topic.toLowerCase().replace(/\s+/g, '-'))}">${esc(topic)}</h2><ul class="guide-list">`
      for (const g of list) {
        out += `<li><a href="/library/read/${GUIDES_BOOK}/${g.id}"${g.kind === 'pdf' ? ' class="oz-pdf"' : ''}>${esc(g.title)}</a> <span class="guide-meta">${esc(g.publisher)}</span><br>${esc(g.summary)}</li>`
      }
      out += '</ul>'
    }
    return out
  }

  random(): string | null {
    const ids = this.rows().map((r) => r.id).filter((id) => guide(id)?.kind === 'page')
    return ids.length ? ids[Math.floor(Math.random() * ids.length)]! : null
  }

  /** Guides matching every word, by title first, then summary, then text. */
  search(q: string, start = 0, pageLength = 10): { total: number; hits: SearchHit[] } {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return { total: 0, hits: [] }
    const rows = new Map(this.rows().map((r) => [r.id, r]))
    const scored = GUIDES.filter((g) => rows.has(g.id))
      .map((g) => {
        const title = g.title.toLowerCase()
        const meta = `${g.summary} ${g.publisher} ${g.topic}`.toLowerCase()
        const text = rows.get(g.id)!.text.toLowerCase()
        let score = 0
        for (const w of words) {
          if (title.includes(w)) score += 10
          else if (meta.includes(w)) score += 4
          else if (text.includes(w)) score += 1
          else return null
        }
        return { g, score, text: rows.get(g.id)!.text }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score)
    const hits = scored.slice(start, start + pageLength).map(({ g, text }): SearchHit => {
      const at = text.toLowerCase().indexOf(words[0]!)
      const snippet = at > 0 ? `…${text.slice(Math.max(0, at - 60), at + 160).trim()}…` : g.summary
      return { contentId: GUIDES_BOOK, bookTitle: GUIDES_TITLE, path: g.id, title: g.title, snippet, words: null }
    })
    return { total: scored.length, hits }
  }

  suggest(q: string, count = 4): Omit<Suggestion, 'bookTitle'>[] {
    const term = q.toLowerCase()
    const saved = new Set(this.rows().map((r) => r.id))
    return GUIDES.filter((g) => saved.has(g.id) && g.title.toLowerCase().includes(term))
      .slice(0, count)
      .map((g) => ({ contentId: GUIDES_BOOK, title: g.title, path: g.id }))
  }
}
