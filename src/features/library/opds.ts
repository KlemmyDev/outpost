import { XMLParser } from 'fast-xml-parser'
import type { Book, CatalogEntry, SearchHit } from './types'

/**
 * Parsers for what Kiwix speaks: OPDS catalogue feeds (both kiwix-serve's own
 * list of installed books and library.kiwix.org's catalogue) and the RSS that
 * its full-text search returns.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => name === 'entry' || name === 'link' || name === 'item',
})

type Node = Record<string, unknown>

const text = (v: unknown): string => {
  if (v === undefined || v === null) return ''
  // RSS items' <link> comes through as a one-element list (Atom's links need to be lists).
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Node)['#text'])
  return String(v).trim()
}
const int = (v: unknown): number => {
  const n = Number.parseInt(text(v), 10)
  return Number.isFinite(n) ? n : 0
}
const links = (e: Node): Node[] => (Array.isArray(e.link) ? (e.link as Node[]) : [])

/** The last path segment of a `/content/<id>` link is Kiwix's content id. */
export function contentIdFromHref(href: string): string {
  const m = /\/content\/([^/?#]+)/.exec(href)
  return m ? decodeURIComponent(m[1]!) : ''
}

interface RawEntry {
  uuid: string
  name: string
  flavour: string
  title: string
  summary: string
  language: string
  category: string
  articleCount: number
  mediaCount: number
  date: string
  pictures: boolean
  contentId: string
  acquisition: { href: string; length: number } | null
  icon: string | null
}

function readEntry(e: Node): RawEntry {
  const ls = links(e)
  const html = ls.find((l) => text(l.type) === 'text/html')
  const acq = ls.find((l) => text(l.rel).endsWith('/acquisition/open-access'))
  const thumb = ls.find((l) => text(l.rel).endsWith('/image/thumbnail'))
  const tags = text(e.tags)
  return {
    uuid: text(e.id).replace(/^urn:uuid:/, ''),
    name: text(e.name),
    flavour: text(e.flavour),
    title: text(e.title),
    summary: text(e.summary),
    language: text(e.language),
    category: text(e.category),
    articleCount: int(e.articleCount),
    mediaCount: int(e.mediaCount),
    date: (text(e.issued) || text(e.updated)).slice(0, 10),
    pictures: !tags.includes('_pictures:no'),
    contentId: html ? contentIdFromHref(text(html.href)) : '',
    acquisition: acq ? { href: text(acq.href), length: int(acq.length) } : null,
    icon: thumb ? text(thumb.href) : null,
  }
}

function feed(xml: string): Node {
  const doc = parser.parse(xml) as Node
  return (doc.feed as Node | undefined) ?? {}
}

/** kiwix-serve's `/catalog/v2/entries`: the books installed here. Sizes are filled in from the files. */
export function parseLocalCatalog(xml: string): Omit<Book, 'sizeBytes'>[] {
  const entries = (feed(xml).entry as Node[] | undefined) ?? []
  return entries
    .map(readEntry)
    .filter((e) => e.contentId)
    .map(({ acquisition: _a, icon: _i, ...e }) => e)
}

/**
 * library.kiwix.org's catalogue. Each entry links a `.meta4` mirror list; the
 * `.zim` itself is the same URL without it, and download.kiwix.org redirects
 * that to a nearby mirror.
 */
export function parseRemoteCatalog(xml: string, base = 'https://library.kiwix.org'): { entries: CatalogEntry[]; total: number } {
  const f = feed(xml)
  const entries = ((f.entry as Node[] | undefined) ?? [])
    .map(readEntry)
    .filter((e) => e.acquisition && e.name)
    .map(({ acquisition, icon, ...e }): CatalogEntry => {
      const url = acquisition!.href.replace(/\.meta4$/, '')
      return {
        ...e,
        url,
        sizeBytes: acquisition!.length,
        contentId: e.contentId || (url.split('/').pop() ?? '').replace(/\.zim$/, ''),
        icon: icon ? new URL(icon, base).toString() : null,
      }
    })
  return { entries, total: int(f.totalResults) || entries.length }
}

/** kiwix-serve's `/search?format=xml`, an RSS feed of matching articles. */
export function parseSearch(xml: string, contentId: string): { total: number; hits: SearchHit[] } {
  const doc = parser.parse(xml) as Node
  const channel = ((doc.rss as Node | undefined)?.channel as Node | undefined) ?? {}
  const items = (channel.item as Node[] | undefined) ?? []
  const prefix = `/content/${encodeURIComponent(contentId)}/`
  const hits = items.map((it): SearchHit => {
    const link = text(it.link)
    const at = link.indexOf(prefix)
    const encoded = at >= 0 ? link.slice(at + prefix.length) : link.replace(/^.*\/content\/[^/]+\//, '')
    const words = int(it.wordCount)
    return {
      contentId,
      bookTitle: text((it.book as Node | undefined)?.title),
      path: safeDecode(encoded),
      title: text(it.title),
      snippet: cleanSnippet(text(it.description), text(it.title)),
      words: words || null,
    }
  })
  return { total: int(channel.totalResults), hits }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Kiwix's snippets start with the title and are padded with page furniture. Keeps the readable part. */
export function cleanSnippet(s: string, title = ''): string {
  let plain = s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/Next items are not visible in browsers without Javascript/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (title && plain.startsWith(title)) plain = plain.slice(title.length).trim()
  if (plain.length <= 220) return plain
  const cut = plain.slice(0, 220)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 160 ? cut.lastIndexOf(' ') : 220)}…`
}
