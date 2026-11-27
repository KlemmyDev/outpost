import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GUIDE_HOSTS, GUIDES, GUIDES_BOOK, guide } from '#/features/library/guides/catalog'
import { extractGuidePage } from '#/features/library/guides/extract.server'
import { GuideManager } from '#/features/library/guides/guides.server'
import { MIGRATIONS } from '#/features/library/store.server'
import { migrate, openDatabase } from '#/platform/server/db.server'

const SNAKE = guide('anzcor-snake-bite')!
const BANDAGE = guide('anzcor-pressure-bandage')!
const RAIN = 'keep the person still and call an ambulance. '.repeat(20)

const PAGE = `<html><head><title>Guideline 9.4.1 – First Aid Management of Australian Snake Bite</title><script>track()</script></head><body>
<nav>menu</nav>
<main><div class="c-guideline-item-page"><p class="c-guideline-item-page__expand">Expand All</p>
  <div class="c-guideline-item-page-item"><h3 class="c-guideline-item-page-item__title">Summary </h3><span class="c-guideline-item-page-plus"></span>
    <h4>Recommendations</h4><p onclick="x()">${RAIN}</p>
    <p>See <a href="/home/first-aid/guideline-9-4-8-envenomation-pressure-immobilisation-technique">pressure immobilisation</a> and <a href="https://example.org/more">more</a>.</p>
    <img src="/assets/GL-9/bandage.jpg" alt="Bandage"><img src="/assets/GL-9/bandage.jpg" alt="Same again">
  </div>
  <div class="c-guideline-item-page-item"><h3 class="c-guideline-item-page-item__title">Summary </h3><p>Second section.</p></div>
</div></main></body></html>`

describe('guide catalogue', () => {
  it('has unique ids, known topics, and only https sources', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length)
    for (const g of GUIDES) {
      expect(new URL(g.url).protocol).toBe('https:')
      if (g.kind === 'page') expect(g.selector).toBeTruthy()
    }
    expect(GUIDE_HOSTS.has('www.anzcor.org')).toBe(true)
  })
})

describe('guide page extraction', () => {
  const page = extractGuidePage(PAGE, SNAKE.url, SNAKE.selector!, SNAKE.id)

  it('keeps only the guide, without scripts or the site’s buttons', () => {
    for (const gone of ['menu', 'Expand All', 'track()', 'onclick']) expect(page.html).not.toContain(gone)
    expect(page.pageTitle).toContain('Snake Bite')
  })

  it('promotes the top headings to h2 with unique ids for the contents', () => {
    expect(page.toc.map((t) => [t.level, t.id])).toEqual([
      [2, 'summary'],
      [3, 'recommendations'],
      [2, 'summary-2'],
    ])
  })

  it('keeps links to other saved guides in the reader and marks the rest external', () => {
    expect(page.html).toContain(`href="/library/read/${GUIDES_BOOK}/${BANDAGE.id}"`)
    expect(page.html).toContain('href="https://example.org/more" target="_blank" rel="noopener noreferrer" class="oz-external"')
  })

  it('lists each picture once and points the page at the saved copy', () => {
    expect(page.images).toEqual([{ url: 'https://www.anzcor.org/assets/GL-9/bandage.jpg', name: '1.jpg' }])
    expect(page.html.match(/src="\/api\/library\/guides\/anzcor-snake-bite\/1\.jpg"/g)).toHaveLength(2)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-guides-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 32)])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

/** A fake set of publisher sites. `routes` maps URL to a response maker. */
function sites(routes: Record<string, (init?: RequestInit) => Response>, seen: string[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input)
    seen.push(u)
    const r = routes[u]
    return r ? r(init) : new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } })
  }) as typeof fetch
}

async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

function manager(fetchImpl: typeof fetch) {
  const db = openDatabase(join(dir, 'o.db'))
  migrate(db, 'library', MIGRATIONS)
  return new GuideManager(db, join(dir, 'guides'), { notify: () => {}, log: () => {} }, fetchImpl)
}

const settled = (m: GuideManager) => until(() => !m.list().guides.some((g) => g.busy))

describe('saving guides', () => {
  const RED = guide('redcross-rediplan')!

  it('saves a PDF as published and lists it', async () => {
    const m = manager(sites({ [RED.url]: () => new Response(PDF, { headers: { 'content-type': 'application/pdf', etag: '"v1"' } }) }))
    await m.start()
    m.enqueue([RED.id])
    await settled(m)
    expect(readFileSync(join(dir, 'guides', `${RED.id}.pdf`)).equals(PDF)).toBe(true)
    const state = m.list().guides.find((g) => g.id === RED.id)!
    expect(state.bytes).toBe(PDF.length)
    expect(m.book()).toMatchObject({ contentId: GUIDES_BOOK, articleCount: 1 })
    m.stop()
  })

  it('asks politely next time and keeps the copy when nothing changed', async () => {
    let conditional: string | null = null
    let calls = 0
    const m = manager(
      sites({
        [RED.url]: (init) => {
          calls++
          conditional = new Headers(init?.headers).get('if-none-match')
          return calls === 1 ? new Response(PDF, { headers: { 'content-type': 'application/pdf', etag: '"v1"' } }) : new Response(null, { status: 304 })
        },
      }),
    )
    await m.start()
    m.enqueue([RED.id])
    await settled(m)
    m.refreshAll()
    await settled(m)
    expect(calls).toBe(2)
    expect(conditional).toBe('"v1"')
    expect(existsSync(join(dir, 'guides', `${RED.id}.pdf`))).toBe(true)
    m.stop()
  })

  it('finds a moved PDF on the page that links to it', async () => {
    const moved = 'https://www.redcross.org.au/globalassets/new/red-cross-rediplan-disaster-preparedness-guide.pdf'
    const m = manager(
      sites({
        [RED.discover!.page]: () => new Response(`<a href="/globalassets/new/red-cross-rediplan-disaster-preparedness-guide.pdf">RediPlan</a>`, { headers: { 'content-type': 'text/html' } }),
        [moved]: () => new Response(PDF, { headers: { 'content-type': 'application/pdf' } }),
      }),
    )
    await m.start()
    m.enqueue([RED.id])
    await settled(m)
    expect(m.list().guides.find((g) => g.id === RED.id)!.bytes).toBe(PDF.length)
    m.stop()
  })

  it("refuses something that isn't a PDF", async () => {
    const m = manager(sites({ [RED.url]: () => new Response('<html>login</html>', { headers: { 'content-type': 'application/pdf' } }) }))
    await m.start()
    m.enqueue([RED.id])
    await settled(m)
    const state = m.list().guides.find((g) => g.id === RED.id)!
    expect(state.bytes).toBeNull()
    expect(state.error).toMatch(/isn't a PDF/)
    m.stop()
  })

  it('saves a web page guide with its pictures, and finds it by search', async () => {
    const seen: string[] = []
    const m = manager(
      sites(
        {
          [SNAKE.url]: () => new Response(PAGE, { headers: { 'content-type': 'text/html' } }),
          'https://www.anzcor.org/assets/GL-9/bandage.jpg': () => new Response(JPG, { headers: { 'content-type': 'image/jpeg' } }),
        },
        seen,
      ),
    )
    await m.start()
    m.enqueue([SNAKE.id])
    await settled(m)
    expect(existsSync(join(dir, 'guides', `${SNAKE.id}.html`))).toBe(true)
    expect(readFileSync(join(dir, 'guides', SNAKE.id, '1.jpg')).equals(JPG)).toBe(true)
    expect(seen.filter((u) => u.endsWith('bandage.jpg'))).toHaveLength(1)

    const art = await m.article(SNAKE.id)
    expect(art).toMatchObject({ kind: 'article', title: 'Snake bite', source: { publisher: SNAKE.publisher } })
    expect(m.search('ambulance').hits.map((h) => h.path)).toEqual([SNAKE.id])
    expect(m.search('snake').hits[0]).toMatchObject({ contentId: GUIDES_BOOK, path: SNAKE.id })
    expect(m.search('snake helicopter').total).toBe(0)
    expect(m.suggest('snak')).toEqual([{ contentId: GUIDES_BOOK, title: 'Snake bite', path: SNAKE.id }])

    const index = await m.article('')
    expect(index.kind === 'article' && index.html).toContain(`/library/read/${GUIDES_BOOK}/${SNAKE.id}`)

    await m.remove(SNAKE.id)
    expect(existsSync(join(dir, 'guides', SNAKE.id))).toBe(false)
    expect(m.book()).toBeNull()
    m.stop()
  })
})
