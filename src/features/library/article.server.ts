import sanitizeHtml from 'sanitize-html'
import type { TocItem } from './types'

/**
 * Turns a page from a ZIM file into clean HTML for Outpost's reader.
 *
 * - Scripts, styles, forms and anything else that isn't reading matter go.
 *   Inline styles go too, so pages follow the reader's theme (but anything a
 *   page hid with `display:none` stays hidden).
 * - Links between articles become reader links (`/library/read/<book>/<path>`),
 *   pictures load through Outpost (`/api/library/raw/<book>/<path>`), and
 *   outside links are marked, since they need the internet.
 * - Page furniture (edit links, navboxes, hidden categories, the page's own
 *   title) is removed. The headings make the table of contents.
 */

/** Classes whose elements are dropped with everything inside them. */
const DROP_CLASSES = ['mw-editsection', 'navbox', 'navbox-styles', 'mw-empty-elt', 'noprint', 'mw-jump-link', 'sistersitebox', 'oz-hidden']
const DROP_IDS = new Set(['mw-hidden-catlinks', 'contentSub', 'siteSub', 'jump-to-nav', 'firstHeading'])

export interface CleanArticle {
  title: string
  html: string
  toc: TocItem[]
  words: number
}

/** Encodes each segment of a ZIM path for a URL, keeping the slashes between them. */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
}

const ORIGIN = 'http://zim.invalid'

/**
 * Where a link inside a book points: another page in a book (`internal`),
 * the web (`external`) or nowhere useful (null). `rest` keeps its URL encoding.
 */
export function resolveLink(href: string, contentId: string, path: string): { kind: 'internal'; contentId: string; rest: string; hash: string } | { kind: 'external'; href: string } | null {
  const trimmed = href.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed, `${ORIGIN}/content/${encodeURIComponent(contentId)}/${encodePath(path)}`)
  } catch {
    return null
  }
  if (url.origin === ORIGIN) {
    const m = /^\/content\/([^/]+)\/(.*)$/.exec(url.pathname)
    if (!m) return null
    return { kind: 'internal', contentId: decodeURIComponent(m[1]!), rest: m[2]!, hash: url.hash }
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return { kind: 'external', href: url.toString() }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

export function extractTitle(raw: string): string {
  const h1 = /<h1[^>]*id="firstHeading"[^>]*>([\s\S]*?)<\/h1>/i.exec(raw)
  if (h1) return stripTags(h1[1]!)
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)
  return t ? stripTags(t[1]!) : ''
}

export function buildToc(html: string): TocItem[] {
  const toc: TocItem[] = []
  const re = /<h([23])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = stripTags(m[3]!)
    if (text) toc.push({ level: Number(m[1]) as 2 | 3, id: decodeEntities(m[2]!), text })
  }
  return toc
}

export function cleanArticle(raw: string, contentId: string, path: string): CleanArticle {
  const title = extractTitle(raw)
  // Only the page body, when there is one.
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(raw)?.[1] ?? raw

  const html = sanitizeHtml(body, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'details', 'summary', 'figure', 'figcaption', 'section']),
    allowedAttributes: {
      '*': ['id', 'class', 'lang', 'dir', 'title'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      ol: ['start', 'type', 'reversed'],
      li: ['value'],
      time: ['datetime'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title', 'template'],
    transformTags: {
      '*': (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs }
        if (attribs.style && /display\s*:\s*none/i.test(attribs.style)) next.class = `${attribs.class ?? ''} oz-hidden`.trim()
        if (tagName === 'a' && attribs.href !== undefined) {
          const href = attribs.href
          delete next.href
          delete next.target
          delete next.rel
          if (href.startsWith('#')) next.href = href
          else {
            const link = resolveLink(href, contentId, path)
            if (link?.kind === 'internal') {
              next.href =
                link.contentId === contentId && link.rest === encodePath(path) && link.hash
                  ? link.hash
                  : `/library/read/${encodeURIComponent(link.contentId)}/${link.rest}${link.hash}`
            } else if (link?.kind === 'external') {
              next.href = link.href
              next.target = '_blank'
              next.rel = 'noopener noreferrer'
              next.class = `${next.class ?? ''} oz-external`.trim()
            }
          }
        }
        if (tagName === 'img') {
          const src = attribs.src ?? ''
          delete next.src
          delete next.srcset
          if (src.startsWith('data:image/')) next.src = src
          else {
            const link = resolveLink(src, contentId, path)
            if (link?.kind === 'internal') next.src = `/api/library/raw/${encodeURIComponent(link.contentId)}/${link.rest}`
          }
          next.loading = 'lazy'
          next.decoding = 'async'
        }
        return { tagName, attribs: next }
      },
    },
    exclusiveFilter: (frame) => {
      const id = frame.attribs.id
      if (id && DROP_IDS.has(id)) return true
      if (frame.tag === 'h1') return true
      // A picture that couldn't be resolved (an outside URL) is just a broken box offline.
      if (frame.tag === 'img' && !frame.attribs.src) return true
      const cls = frame.attribs.class
      if (!cls) return false
      const list = cls.split(/\s+/)
      return DROP_CLASSES.some((c) => list.includes(c))
    },
  })

  const words = stripTags(html).split(' ').filter(Boolean).length
  return { title, html: html.trim(), toc: buildToc(html), words }
}
