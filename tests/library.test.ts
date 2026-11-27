import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanArticle, encodePath, resolveLink } from '#/features/library/article.server'
import { isAllowedSource } from '#/features/library/catalog.server'
import { DownloadManager, safeContentId } from '#/features/library/downloads.server'
import { pathFromContentUrl } from '#/features/library/kiwix.server'
import { cleanSnippet, parseLocalCatalog, parseRemoteCatalog, parseSearch } from '#/features/library/opds'
import { HISTORY_LIMIT, LibraryStore, MIGRATIONS } from '#/features/library/store.server'
import { dateFromContentId, type CatalogEntry, type Download } from '#/features/library/types'
import { migrate, openDatabase } from '#/platform/server/db.server'

const REMOTE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <entry>
    <id>urn:uuid:2d7d9c72-e77d-3ce3-b8f6-140790d36f7a</id>
    <title>Wikivoyage</title>
    <updated>2026-09-13T00:00:00Z</updated>
    <summary>The collaborative travel guide</summary>
    <language>eng</language>
    <name>wikivoyage_en_all</name>
    <flavour>maxi</flavour>
    <category>wikivoyage</category>
    <tags>wikivoyage;_category:wikivoyage;_pictures:yes;_ftindex:yes</tags>
    <articleCount>68182</articleCount>
    <mediaCount>90778</mediaCount>
    <link rel="http://opds-spec.org/image/thumbnail" href="/catalog/v2/illustration/2d7d9c72-e77d-3ce3-b8f6-140790d36f7a/?size=48" type="image/png"/>
    <link type="text/html" href="https://browse.library.kiwix.org/content/wikivoyage_en_all_maxi_2026-09" />
    <dc:issued>2026-09-13T00:00:00Z</dc:issued>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://lb.download.kiwix.org/zim/wikivoyage/wikivoyage_en_all_maxi_2026-09.zim.meta4" length="1071169536" />
  </entry>
  <totalResults>3684</totalResults>
</feed>`

const LOCAL = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:uuid:1069cd95-bab8-1494-b6ec-f402f990833b</id>
    <title>Ray Charles</title>
    <updated>2026-10-31T00:00:00Z</updated>
    <summary>Wikipedia articles about Ray Charles</summary>
    <language>eng</language>
    <name>wikipedia_en_ray-charles</name>
    <flavour>mini</flavour>
    <category>wikipedia</category>
    <tags>wikipedia;_pictures:no;_ftindex:yes</tags>
    <articleCount>25562</articleCount>
    <mediaCount>135</mediaCount>
    <link type="text/html" href="/content/wikipedia_en_ray-charles_mini_2026-10" />
  </entry>
</feed>`

const SEARCH = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <channel>
    <opensearch:totalResults>26</opensearch:totalResults>
    <item>
      <title>Category:Songs about pianos</title>
      <link>/content/ray/Category%3ASongs_about_pianos</link>
      <description>Category:Songs about pianos Songs about &lt;b&gt;pianos&lt;/b&gt;. Next items are not visible in browsers without Javascript Baby Grand</description>
      <book><title>Ray Charles</title></book>
      <wordCount>64</wordCount>
    </item>
  </channel>
</rss>`

describe('Kiwix catalogue parsing', () => {
  it('reads an online catalogue entry, pointing at the .zim rather than its mirror list', () => {
    const { entries, total } = parseRemoteCatalog(REMOTE)
    expect(total).toBe(3684)
    expect(entries).toHaveLength(1)
    const e = entries[0]!
    expect(e).toMatchObject({
      uuid: '2d7d9c72-e77d-3ce3-b8f6-140790d36f7a',
      name: 'wikivoyage_en_all',
      flavour: 'maxi',
      contentId: 'wikivoyage_en_all_maxi_2026-09',
      url: 'https://lb.download.kiwix.org/zim/wikivoyage/wikivoyage_en_all_maxi_2026-09.zim',
      sizeBytes: 1071169536,
      articleCount: 68182,
      date: '2026-09-13',
      pictures: true,
    })
    expect(e.icon).toBe('https://library.kiwix.org/catalog/v2/illustration/2d7d9c72-e77d-3ce3-b8f6-140790d36f7a/?size=48')
  })

  it("reads kiwix-serve's list of installed books, with the content id from its link", () => {
    const [b] = parseLocalCatalog(LOCAL)
    expect(b).toMatchObject({ contentId: 'wikipedia_en_ray-charles_mini_2026-10', title: 'Ray Charles', flavour: 'mini', pictures: false, articleCount: 25562 })
  })

  it('reads search results, decoding paths and tidying snippets', () => {
    const { total, hits } = parseSearch(SEARCH, 'ray')
    expect(total).toBe(26)
    expect(hits[0]).toMatchObject({ path: 'Category:Songs_about_pianos', title: 'Category:Songs about pianos', bookTitle: 'Ray Charles', words: 64 })
    expect(hits[0]!.snippet).toBe('Songs about pianos. Baby Grand')
  })

  it('cuts long snippets at a word', () => {
    const s = cleanSnippet('word '.repeat(80))
    expect(s.length).toBeLessThanOrEqual(221)
    expect(s.endsWith('word…')).toBe(true)
  })

  it('pulls the edition out of a content id', () => {
    expect(dateFromContentId('wikipedia_en_all_maxi_2026-10')).toBe('2026-10')
    expect(dateFromContentId('ray')).toBeNull()
  })
})

describe('article cleaning', () => {
  const book = 'wiki_en_maxi_2026-10'
  const page = `<!DOCTYPE html><html><head><title>Ray Charles</title><script>alert(1)</script><link rel="stylesheet" href="./_res_/a.css"></head>
  <body><main><h1 id="firstHeading">Ray Charles</h1>
  <p onclick="steal()" style="color:red">Ray Charles was a <a href="Pianist" title="Pianist">pianist</a> from <a href="./Albany%2C_Georgia#History">Albany</a>.<span style="display: none">hidden sort key</span></p>
  <style>.x{color:red}</style>
  <section><div class="mw-heading mw-heading2"><h2 id="Early_life">Early <i>life</i></h2><span class="mw-editsection">[edit]</span></div>
  <p>See <a href="#Career">below</a>, <a href="Ray_Charles#Career">also below</a> and <a href="https://raycharles.com">his site</a> or <a href="javascript:alert(1)">this</a>.</p>
  <figure class="mw-halign-right"><img src="./_assets_/abc/Ray%252C_1969.jpg" srcset="x 2x" onerror="bad()" width="250" height="300"><figcaption>Ray in 1969</figcaption></figure>
  <img src="https://upload.wikimedia.org/remote.jpg"></section>
  <section><h3 id="Career">Career &amp; legacy</h3><iframe src="https://evil"></iframe><form><input></form></section>
  <div class="navbox">lots of links</div><div id="mw-hidden-catlinks">Hidden categories</div>
  </main></body></html>`

  const a = cleanArticle(page, book, 'Ray_Charles')

  it('keeps the title and builds contents from the headings', () => {
    expect(a.title).toBe('Ray Charles')
    expect(a.toc).toEqual([
      { level: 2, id: 'Early_life', text: 'Early life' },
      { level: 3, id: 'Career', text: 'Career & legacy' },
    ])
  })

  it('removes scripts, styles, handlers, frames and forms', () => {
    for (const bad of ['<script', 'alert(1)', 'onclick', 'onerror', 'style=', '<style', '.x{', '<iframe', '<form', '<input', 'javascript:', 'srcset']) {
      expect(a.html).not.toContain(bad)
    }
  })

  it("drops page furniture, the page's own title and anything it hid", () => {
    for (const gone of ['[edit]', 'lots of links', 'Hidden categories', 'hidden sort key', '<h1']) expect(a.html).not.toContain(gone)
  })

  it('turns article links into reader links and keeps same-page links as anchors', () => {
    expect(a.html).toContain(`href="/library/read/${book}/Pianist"`)
    expect(a.html).toContain(`href="/library/read/${book}/Albany%2C_Georgia#History"`)
    expect(a.html).toContain('href="#Career">below')
    expect(a.html).toContain('href="#Career">also below')
  })

  it('marks outside links and opens them in a new tab', () => {
    expect(a.html).toContain('<a href="https://raycharles.com/" target="_blank" rel="noopener noreferrer" class="oz-external">his site</a>')
  })

  it('loads pictures through Outpost and drops ones that need the internet', () => {
    expect(a.html).toContain(`src="/api/library/raw/${book}/_assets_/abc/Ray%252C_1969.jpg"`)
    expect(a.html).toContain('loading="lazy"')
    expect(a.html).not.toContain('upload.wikimedia.org')
  })

  it('resolves links between books and up a level', () => {
    expect(resolveLink('../other_book/Page', book, 'Ray_Charles')).toMatchObject({ kind: 'internal', contentId: 'other_book', rest: 'Page' })
    expect(resolveLink('Sub/Page', book, 'A/B')).toMatchObject({ kind: 'internal', contentId: book, rest: 'A/Sub/Page' })
    expect(resolveLink('ftp://x/y', book, 'A')).toBeNull()
    expect(encodePath('A/Albany, Georgia')).toBe('A/Albany%2C%20Georgia')
  })

  it("reads Kiwix's redirects back to a path in the book", () => {
    expect(pathFromContentUrl('http://kiwix:8080/content/ray/Category%3ATech', 'ray')).toBe('Category:Tech')
    expect(pathFromContentUrl('/content/ray/index', 'ray')).toBe('index')
    expect(pathFromContentUrl('/content/other/index', 'ray')).toBeNull()
  })
})

describe('download safety checks', () => {
  it('only downloads .zim files from Kiwix over HTTPS', () => {
    expect(isAllowedSource('https://download.kiwix.org/zim/wikipedia/x.zim')).toBe(true)
    expect(isAllowedSource('https://lb.download.kiwix.org/zim/x.zim')).toBe(true)
    expect(isAllowedSource('http://download.kiwix.org/zim/x.zim')).toBe(false)
    expect(isAllowedSource('https://kiwix.org.evil.com/x.zim')).toBe(false)
    expect(isAllowedSource('https://download.kiwix.org/zim/x.zim.meta4')).toBe(false)
  })

  it('only writes plain file names', () => {
    expect(safeContentId('wikipedia_en_all_maxi_2026-10')).toBe(true)
    for (const bad of ['../etc', 'a/b', '.hidden', '', 'a b']) expect(safeContentId(bad)).toBe(false)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-lib-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function store() {
  const db = openDatabase(join(dir, 'o.db'))
  migrate(db, 'library', MIGRATIONS)
  return new LibraryStore(db)
}

describe('saved pages and history', () => {
  it('saves and unsaves a page', () => {
    const s = store()
    const page = { contentId: 'b', path: 'P', title: 'Page', bookTitle: 'Book' }
    s.setSaved(page, true)
    expect(s.isSaved('b', 'P')).toBe(true)
    expect(s.bookmarks()).toHaveLength(1)
    s.setSaved(page, false)
    expect(s.isSaved('b', 'P')).toBe(false)
  })

  it('keeps one history entry per page, newest first, up to the limit', () => {
    const s = store()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s.visit({ contentId: 'b', path: `P${i}`, title: `Page ${i}`, bookTitle: 'Book' })
    s.visit({ contentId: 'b', path: 'P10', title: 'Page 10', bookTitle: 'Book' })
    const h = s.history()
    expect(h).toHaveLength(HISTORY_LIMIT)
    expect(h.filter((x) => x.path === 'P10')).toHaveLength(1)
    s.clearHistory()
    expect(s.history()).toHaveLength(0)
  })
})

describe('downloads', () => {
  const body = Buffer.from('ZIM!'.repeat(50_000)) // 200 kB
  const sha = createHash('sha256').update(body).digest('hex')
  const url = 'https://download.kiwix.org/zim/test/test_en_all_maxi_2026-10.zim'
  const entry: CatalogEntry = {
    uuid: 'u',
    name: 'test_en_all',
    flavour: 'maxi',
    title: 'Test',
    summary: '',
    language: 'eng',
    category: 'test',
    articleCount: 1,
    mediaCount: 0,
    date: '2026-10-01',
    sizeBytes: body.length,
    url,
    contentId: 'test_en_all_maxi_2026-10',
    icon: null,
    pictures: true,
  }

  /** A fake Kiwix mirror that honours Range requests. */
  function mirror(opts: { hash?: string; ranges?: string[] } = {}): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input)
      if (u.endsWith('.sha256')) return new Response(`${opts.hash ?? sha}  test.zim\n`)
      const range = new Headers(init?.headers).get('range')
      opts.ranges?.push(range ?? '')
      const from = range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0
      const part = body.subarray(from)
      return new Response(part, {
        status: range ? 206 : 200,
        headers: { 'content-length': String(part.length), ...(range ? { 'content-range': `bytes ${from}-${body.length - 1}/${body.length}` } : {}) },
      })
    }) as typeof fetch
  }

  async function until(fn: () => boolean, ms = 3000) {
    const end = Date.now() + ms
    while (!fn()) {
      if (Date.now() > end) throw new Error('timed out')
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  const notes: string[] = []
  const ctx = { notify: (n: { title: string }) => void notes.push(n.title), log: () => {} }

  it('downloads, checks the hash, and only then names it .zim', async () => {
    const s = store()
    const lib = join(dir, 'library')
    const m = new DownloadManager(s, lib, ctx, mirror())
    await m.start()
    const d = await m.add(entry)
    await until(() => s.download(d.id)!.state === 'done')
    const file = join(lib, 'test_en_all_maxi_2026-10.zim')
    expect(readFileSync(file).equals(body)).toBe(true)
    expect(existsSync(`${file}.part`)).toBe(false)
    expect(statSync(file).mode & 0o777).toBe(0o644)
    expect(notes).toContain('Test is ready')
    await expect(m.add(entry)).rejects.toThrow(/already in the library/)
    m.stop()
  })

  it('resumes a partial download with a Range request', async () => {
    const s = store()
    const lib = join(dir, 'library')
    const ranges: string[] = []
    const m = new DownloadManager(s, lib, ctx, mirror({ ranges }))
    await m.start()
    writeFileSync(join(lib, 'test_en_all_maxi_2026-10.zim.part'), body.subarray(0, 120_000))
    const d = await m.add(entry)
    await until(() => s.download(d.id)!.state === 'done')
    expect(ranges[0]).toBe('bytes=120000-')
    expect(readFileSync(join(lib, 'test_en_all_maxi_2026-10.zim')).equals(body)).toBe(true)
    m.stop()
  })

  it('deletes a file that arrives damaged', async () => {
    const s = store()
    const lib = join(dir, 'library')
    const m = new DownloadManager(s, lib, ctx, mirror({ hash: 'f'.repeat(64) }))
    await m.start()
    const d = await m.add(entry)
    await until(() => s.download(d.id)!.state === 'failed')
    expect(s.download(d.id)!.error).toMatch(/damaged/)
    expect(existsSync(join(lib, 'test_en_all_maxi_2026-10.zim'))).toBe(false)
    expect(existsSync(join(lib, 'test_en_all_maxi_2026-10.zim.part'))).toBe(false)
    m.stop()
  })

  it('refuses sources other than Kiwix', async () => {
    const m = new DownloadManager(store(), join(dir, 'library'), ctx, mirror())
    await m.start()
    await expect(m.add({ ...entry, url: 'https://example.com/x.zim' })).rejects.toThrow(/only be downloaded from Kiwix/)
    m.stop()
  })

  it('replaces the old edition once the new one is in', async () => {
    const s = store()
    const lib = join(dir, 'library')
    const m = new DownloadManager(s, lib, ctx, mirror())
    await m.start()
    writeFileSync(join(lib, 'test_en_all_maxi_2026-09.zim'), 'old')
    const d = await m.add(entry, 'test_en_all_maxi_2026-09')
    await until(() => s.download(d.id)!.state === 'done')
    expect(existsSync(join(lib, 'test_en_all_maxi_2026-09.zim'))).toBe(false)
    expect(existsSync(join(lib, 'test_en_all_maxi_2026-10.zim'))).toBe(true)
    m.stop()
  })

  it('runs as many at once as allowed, and starts more when that goes up', async () => {
    const s = store()
    const lib = join(dir, 'library')
    let running = 0
    let peak = 0
    const gates: (() => void)[] = []
    const slow = (async (input: string | URL | Request) => {
      const u = String(input)
      if (u.endsWith('.sha256')) return new Response('nope', { status: 404 })
      running++
      peak = Math.max(peak, running)
      await new Promise<void>((r) => gates.push(r))
      running--
      return new Response(body, { headers: { 'content-length': String(body.length) } })
    }) as typeof fetch
    const m = new DownloadManager(s, lib, ctx, slow, 2)
    await m.start()
    const ids: number[] = []
    for (const n of ['a', 'b', 'c']) ids.push((await m.add({ ...entry, contentId: `test_${n}_2026-10`, url: `https://download.kiwix.org/zim/test/test_${n}_2026-10.zim` })).id)
    await until(() => running === 2)
    expect(s.download(ids[2]!)!.state).toBe('queued')
    m.setParallel(3)
    await until(() => running === 3)
    expect(peak).toBe(3)
    while (gates.length) gates.shift()!()
    await until(() => ids.every((id) => s.download(id)!.state === 'done'))
    expect(m.setParallel(9)).toBe(4)
    m.stop()
  })

  it('puts interrupted downloads back in the queue after a restart', () => {
    const s = store()
    const d: Download = s.addDownload({ ...entry, replaces: null })
    s.update(d.id, { state: 'downloading' })
    expect(s.requeueInterrupted()).toBe(1)
    expect(s.download(d.id)!.state).toBe('queued')
  })
})
