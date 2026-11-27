import { parseRemoteCatalog } from './opds'
import type { CatalogEntry, CatalogPage, Recommendation } from './types'

const CATALOG = 'https://library.kiwix.org'
const CACHE_MS = 6 * 60 * 60 * 1000

/**
 * The picks on the Sources screen: broadly useful, kept up to date by Kiwix,
 * and in English. Each offers the versions Kiwix makes (with pictures, text
 * only, introductions only) so a smaller disk can still hold something.
 */
export const RECOMMENDED: { name: string; title: string; why: string }[] = [
  { name: 'wikipedia_en_all', title: 'Wikipedia', why: 'The whole English encyclopedia. With pictures needs about half of a 250 GB disk.' },
  { name: 'mdwiki_en_all', title: 'WikiMed', why: 'Medical encyclopedia: conditions, medicines, anatomy and procedures.' },
  { name: 'wikivoyage_en_all', title: 'Wikivoyage', why: 'Travel guides with maps, transport and safety notes for places worldwide.' },
  { name: 'wikibooks_en_all', title: 'Wikibooks', why: 'Open textbooks, including the Cookbook with thousands of recipes.' },
  { name: 'ifixit_en_all', title: 'iFixit', why: 'Step-by-step repair guides for phones, cars, appliances and tools.' },
  { name: 'wiktionary_en_all', title: 'Wiktionary', why: 'Dictionary and thesaurus, with pronunciations and word origins.' },
]

/** Flavours in the order they're offered: biggest and best first. */
const FLAVOUR_ORDER = ['maxi', '', 'nopic', 'mini']

export class CatalogError extends Error {
  readonly status = 503
}

/** Kiwix's online catalogue, cached so the Sources screen doesn't refetch it on every visit. */
export class Catalog {
  private cache = new Map<string, { at: number; value: unknown }>()

  constructor(private readonly base = CATALOG) {}

  private async get(query: URLSearchParams): Promise<{ entries: CatalogEntry[]; total: number }> {
    const key = query.toString()
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as { entries: CatalogEntry[]; total: number }
    let res: Response
    try {
      res = await fetch(`${this.base}/catalog/v2/entries?${key}`, { signal: AbortSignal.timeout(20_000), redirect: 'follow' })
    } catch {
      throw new CatalogError("Can't reach Kiwix's catalogue. Browsing for new books needs the internet.")
    }
    if (!res.ok) throw new CatalogError(`Kiwix's catalogue answered ${res.status}. Try again later.`)
    const value = parseRemoteCatalog(await res.text(), this.base)
    this.cache.set(key, { at: Date.now(), value })
    return value
  }

  async browse({ q = '', lang = 'eng', category = '', start = 0, count = 24 }: { q?: string; lang?: string; category?: string; start?: number; count?: number }): Promise<CatalogPage> {
    const query = new URLSearchParams({ count: String(count), start: String(start) })
    if (q.trim()) query.set('q', q.trim())
    if (lang) query.set('lang', lang)
    if (category) query.set('category', category)
    const { entries, total } = await this.get(query)
    return { entries, total, start }
  }

  /** Every version of one collection, best first. */
  async versions(name: string): Promise<CatalogEntry[]> {
    const { entries } = await this.get(new URLSearchParams({ name, count: '20' }))
    return entries
      .filter((e) => e.name === name)
      .sort((a, b) => FLAVOUR_ORDER.indexOf(a.flavour) - FLAVOUR_ORDER.indexOf(b.flavour) || b.date.localeCompare(a.date))
  }

  async recommended(): Promise<Recommendation[]> {
    const lists = await Promise.all(RECOMMENDED.map((r) => this.versions(r.name).catch(() => [] as CatalogEntry[])))
    if (lists.every((l) => l.length === 0)) throw new CatalogError("Can't reach Kiwix's catalogue. Browsing for new books needs the internet.")
    return RECOMMENDED.map((r, i) => ({ ...r, options: lists[i]! })).filter((r) => r.options.length > 0)
  }

  /** The newest catalogue entry for an installed book's collection and flavour, if it's newer. */
  async newerThan(name: string, flavour: string, contentId: string): Promise<CatalogEntry | null> {
    const latest = (await this.versions(name)).find((e) => e.flavour === flavour)
    return latest && latest.contentId !== contentId && latest.contentId > contentId ? latest : null
  }
}

/** Downloads may only come from Kiwix (which then redirects to a mirror). */
export function isAllowedSource(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'kiwix.org' || u.hostname.endsWith('.kiwix.org')) && u.pathname.endsWith('.zim')
  } catch {
    return false
  }
}
