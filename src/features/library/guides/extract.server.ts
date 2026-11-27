import { selectAll, selectOne } from 'css-select'
import render from 'dom-serializer'
import type { Element } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import { buildToc, extractTitle, plainText, sanitizePage } from '../article.server'
import type { TocItem } from '../types'
import { GUIDES, GUIDES_BOOK } from './catalog'

/** Bits of publisher pages that only work with their scripts (expand buttons and the like). */
const JUNK = ['.c-guideline-item-page__expand', '.c-guideline-item-page-plus', 'button', 'nav', 'form', '[aria-hidden="true"]']

export interface ExtractedPage {
  pageTitle: string
  html: string
  toc: TocItem[]
  text: string
  /** Pictures to fetch: absolute URL, and the name it's stored under. */
  images: { url: string; name: string }[]
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/&[a-z]+;/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'section'
  )
}

/**
 * Pulls a guide's content out of its publisher's web page: just the part the
 * selector names, with headings promoted so the reader's contents work, links
 * pointing at other saved guides kept inside the reader, and pictures listed
 * so they can be saved alongside.
 */
export function extractGuidePage(raw: string, pageUrl: string, selector: string, guideId: string): ExtractedPage {
  const doc = parseDocument(raw)
  const root = (selectOne(selector, doc) ?? selectOne('main', doc) ?? selectOne('body', doc) ?? doc) as unknown as Element
  for (const el of selectAll(JUNK.join(','), root)) {
    const parent = el.parent as Element | null
    if (parent) parent.children = parent.children.filter((c) => c !== el)
  }

  // Publishers' top-level sections are often h3s; make the highest level present an h2.
  const levels = ['h2', 'h3', 'h4', 'h5'].filter((h) => selectAll(h, root).length > 0)
  const shift = levels[0] ? Number(levels[0][1]) - 2 : 0
  const used = new Set<string>()
  for (const el of selectAll('h2,h3,h4,h5,h6', root)) {
    const level = Math.max(2, Number(el.name[1]) - shift)
    el.name = `h${Math.min(6, level)}`
    let id = el.attribs.id || slug(plainText(render(el.children)))
    while (used.has(id)) id = `${id}-2`
    used.add(id)
    el.attribs.id = id
  }

  const images: ExtractedPage['images'] = []
  const byUrl = new Map<string, string>()
  const guideUrls = new Map(GUIDES.map((g) => [normalise(g.url), g.id]))

  const html = sanitizePage(render(root), {
    link: (href) => {
      let url: URL
      try {
        url = new URL(href, pageUrl)
      } catch {
        return null
      }
      const other = guideUrls.get(normalise(url.toString()))
      if (other) return { href: `/library/read/${GUIDES_BOOK}/${other}${url.hash}` }
      if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return { href: url.toString(), external: true }
      return null
    },
    image: (src) => {
      let url: URL
      try {
        url = new URL(src, pageUrl)
      } catch {
        return null
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      const key = url.toString()
      let name = byUrl.get(key)
      if (!name) {
        if (images.length >= 40) return null
        const ext = /\.(jpe?g|png|gif|webp|svg)$/i.exec(url.pathname)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'img'
        name = `${images.length + 1}.${ext}`
        byUrl.set(key, name)
        images.push({ url: key, name })
      }
      return `/api/library/guides/${guideId}/${name}`
    },
  })

  return { pageTitle: extractTitle(raw), html, toc: buildToc(html), text: plainText(html), images }
}

function normalise(u: string): string {
  try {
    const url = new URL(u)
    return `${url.hostname}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return u
  }
}
