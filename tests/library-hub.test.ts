import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clip, extractPreview, Hub, isArticlePath } from '#/features/library/hub.server'
import type { Library } from '#/features/library/server'
import type { Book, SearchHit } from '#/features/library/types'

const WIKI = `<html class="vector-feature-main-menu-disabled"><head><title>Ray Charles - Wikipedia</title></head><body>
<h1 id="firstHeading">Ray Charles</h1>
<p class="mw-empty-elt"></p>
<div class="hatnote">For the other one, see Ray Charles (disambiguation).</div>
<table class="infobox"><tr><td><img src="./_assets_/a/Ray.jpg" width="250" height="295"></td></tr><tr><td><p>Born 1930 in Albany, Georgia, United States of America</p></td></tr></table>
<p><b>Ray Charles Robinson</b><sup>[1]</sup> was an American singer, songwriter, and pianist, often called "The Genius".</p>
<p>Second paragraph.</p></body></html>`

const RECIPE = `<html><head><title>Savory Squash</title><meta property="og:description" content="Savory Squash by Joe Powerhouse"><meta property="og:image" content="/favicon/apple-touch-icon.png"></head>
<body><header><h1>Savory Squash</h1></header><ul><li>1 Butternut Squash</li><li>1/2 Stick of butter</li><li>Salt, to taste</li></ul></body></html>`

describe('page previews', () => {
  it('takes the lead picture and first real paragraph, skipping boxes and notes', () => {
    const p = extractPreview(WIKI, 'wiki_en', 'Ray_Charles')
    expect(p.title).toBe('Ray Charles')
    expect(p.image).toBe('/api/library/raw/wiki_en/_assets_/a/Ray.jpg')
    expect(p.excerpt).toBe('Ray Charles Robinson was an American singer, songwriter, and pianist, often called "The Genius".')
  })

  it('describes list pages from their first items, and ignores site icons', () => {
    const p = extractPreview(RECIPE, 'cook', 'recipe/squash')
    expect(p.image).toBeNull()
    expect(p.excerpt).toBe('Savory Squash by Joe Powerhouse. 1 Butternut Squash · 1/2 Stick of butter · Salt, to taste')
  })

  it('skips icons and small pictures', () => {
    const p = extractPreview('<p>x</p><img src="flag.png" width="300"><img src="tiny.jpg" width="40" height="30"><img src="big.jpg" width="400" height="300">', 'b', 'a')
    expect(p.image).toBe('/api/library/raw/b/big.jpg')
  })

  it('clips at a sentence or a word', () => {
    expect(clip('One sentence here. Another one that runs on and on and on.', 28)).toBe('One sentence here.')
    expect(clip('word '.repeat(20), 22)).toMatch(/^word( word)*…$/)
  })

  it('knows which pages are articles', () => {
    expect(isArticlePath('Ray_Charles')).toBe(true)
    expect(isArticlePath('Category:Soul_musicians')).toBe(false)
    expect(isArticlePath('foss.cooking/tag/coconut')).toBe(false)
    expect(isArticlePath('_assets_/x.jpg')).toBe(false)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-hub-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const book = (contentId: string, title: string, name = contentId): Book => ({
  contentId, name, title, flavour: '', summary: '', language: 'eng', category: '', articleCount: 100, mediaCount: 0, date: '2026-10-01', sizeBytes: 1, uuid: '', pictures: true,
})

async function makeHub(pages: Record<string, string>, searches: Record<string, SearchHit[]>) {
  const { openDatabase } = await import('#/platform/server/db.server')
  const { SettingsStore } = await import('#/platform/server/settings.server')


  const db = openDatabase(join(dir, 'o.db'))
  const { MIGRATIONS } = await import('#/features/library/store.server')
  db.exec(MIGRATIONS.at(-1) as string)
  const books = [book('cook_en', 'FOSS cooking', 'foss.cooking_en_all'), book('wiki_en', 'Wikipedia', 'wikipedia_en_all'), book('maps_en', 'Niue', 'maps_en_niue')]
  let randoms = 0
  const library = {
    books: async () => books,
    readPage: async (contentId: string, path: string) => {
      const body = pages[`${contentId}/${path}`]
      return body ? { kind: 'page', path, body } : { kind: 'missing', path, status: 404 }
    },
    kiwix: {
      search: async (contentId: string, q: string) => ({ total: 1, hits: (searches[`${contentId}:${q}`] ?? []).map((h) => ({ ...h, contentId })) }),
      random: async (contentId: string) => (contentId === 'cook_en' ? ['recipe/squash', 'tag/coconut', 'recipe/bread'][randoms++ % 3]! : 'Ray_Charles'),
    },
    guides: { search: () => ({ total: 0, hits: [] }), random: () => null },
  } as unknown as Library
  return new Hub(library, db, new SettingsStore(db), dir)
}

const hit = (path: string, title: string): SearchHit => ({ contentId: '', bookTitle: '', path, title, snippet: '', words: null })

describe('the hub', () => {
  it('gathers a topic from every book, keeping off-topic books to title matches', async () => {
    const hub = await makeHub(
      {
        'cook_en/recipe/bread': '<title>Bread</title><p>A plain loaf that needs only flour, water, salt and yeast, and an oven or a camp oven.</p>',
        'cook_en/recipe/noodles': '<title>Yibin Burning Noodles</title><p>Dry noodles.</p>',
        'wiki_en/Bread': '<title>Bread</title><img src="b.jpg"><p>Bread is a staple food prepared from a dough of flour and water, usually by baking.</p>',
        'wiki_en/Ray_Charles': WIKI,
      },
      {
        'cook_en:bread': [hit('recipe/bread', 'Bread')],
        'wiki_en:bread': [hit('Bread', 'Bread'), hit('Ray_Charles', 'Ray Charles')],
        'wiki_en:burns': [hit('Yibin', 'Yibin Burning Noodles')],
      },
    )
    const food = (await hub.topic('food'))!
    // The picture leads; Ray Charles mentions bread but isn't in a cookbook and his title doesn't say so.
    expect(food.reads.map((r) => `${r.contentId}/${r.path}`)).toEqual(['wiki_en/Bread', 'cook_en/recipe/bread'])
    expect(food.books.map((b) => b.title)).toEqual(['FOSS cooking'])
    expect((await hub.topic('health'))!.reads).toEqual([])
    const tiles = await hub.summaries()
    expect(tiles.find((t) => t.id === 'food')).toEqual({ id: 'food', count: 2, images: ['/api/library/raw/wiki_en/b.jpg'] })
  })

  it('picks pages for the day, skips listings and keeps them all day', async () => {
    const hub = await makeHub(
      {
        'cook_en/recipe/squash': RECIPE,
        'cook_en/tag/coconut': '<title>Tag: coconut</title><p>Every recipe with coconut in it, from cakes to curries and drinks, listed here for you.</p>',
        'cook_en/recipe/bread': '<title>Bread</title><p>A plain loaf that needs only flour, water, salt and yeast, and an oven or a camp oven.</p>',
        'wiki_en/Ray_Charles': WIKI,
      },
      {},
    )
    const d = await hub.discover()
    const titles = d.items.map((p) => p.title).sort()
    expect(titles).toEqual(['Bread', 'Ray Charles', 'Savory Squash'])
    expect(d.items[0]!.image).not.toBeNull()
    expect((await hub.discover()).items).toEqual(d.items)
  })
})
