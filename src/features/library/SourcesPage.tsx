import { Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { formatBytes, percent } from '#/platform/ui/format'
import { count, monthYear } from './format'
import { browseCatalog, checkBookUpdates, controlDownload, getDownloads, getRecommended, removeBook, startDownload } from './library.functions'
import { BookIcon } from './ui/BookIcon'
import { DownloadBar } from './ui/DownloadBar'
import { GuidesSection } from './ui/GuidesSection'
import { GUIDES_BOOK } from './guides/catalog'
import { flavourLabel, isAppBook, type Book, type CatalogEntry, type CatalogPage, type Download, type Recommendation, type SourcesData, type StorageInfo } from './types'

/** Matches SPACE_MARGIN on the server: what's kept free after a download. */
const MARGIN = 2 * 1024 ** 3

const LANGUAGES: [string, string][] = [
  ['eng', 'English'],
  ['all', 'Any language'],
  ['fra', 'French'],
  ['deu', 'German'],
  ['spa', 'Spanish'],
  ['ita', 'Italian'],
  ['por', 'Portuguese'],
  ['zho', 'Chinese'],
  ['jpn', 'Japanese'],
  ['ara', 'Arabic'],
  ['hin', 'Hindi'],
  ['vie', 'Vietnamese'],
]

const CATEGORIES: [string, string][] = [
  ['', 'Everything'],
  ['wikipedia', 'Wikipedia'],
  ['wikibooks', 'Wikibooks'],
  ['wikivoyage', 'Wikivoyage'],
  ['wiktionary', 'Wiktionary'],
  ['wikisource', 'Wikisource'],
  ['wikiquote', 'Wikiquote'],
  ['wikiversity', 'Wikiversity'],
  ['gutenberg', 'Project Gutenberg'],
  ['stack_exchange', 'Stack Exchange'],
  ['ted', 'TED talks'],
  ['phet', 'PhET simulations'],
  ['other', 'Other'],
]

const ACTIVE = new Set<Download['state']>(['queued', 'downloading', 'verifying'])

export function SourcesPage({ initial }: { initial: SourcesData }) {
  const router = useRouter()
  const [downloads, setDownloads] = useState(initial.downloads)
  // The Australian guides have their own section below.
  const [allBooks, setBooks] = useState(initial.books)
  const books = allBooks.filter((b) => b.contentId !== GUIDES_BOOK)
  const [storage, setStorage] = useState(initial.storage)
  const [updates, setUpdates] = useState<Record<string, CatalogEntry>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const d = await getDownloads()
    setDownloads(d.downloads)
    setStorage(d.storage)
    setBooks(d.books)
  }, [])

  // Poll while something's downloading, or finished but not yet picked up by Kiwix.
  const installedNow = new Set(books.map((b) => b.contentId))
  const busy = downloads.some((d) => ACTIVE.has(d.state) || (d.state === 'done' && !installedNow.has(d.contentId)))
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void refresh().catch(() => {}), 1500)
    return () => clearInterval(t)
  }, [busy, refresh])

  useEffect(() => {
    checkBookUpdates()
      .then(setUpdates)
      .catch(() => {})
  }, [books.length])

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const download = (e: Pick<CatalogEntry, 'name' | 'contentId'>, replaces?: string) => run(() => startDownload({ data: { name: e.name, contentId: e.contentId, replaces } }))

  const installed = new Set(books.map((b) => b.contentId))
  const pending = new Map(downloads.filter((d) => d.state !== 'done').map((d) => [d.contentId, d]))
  const shown = downloads.filter((d) => d.state !== 'done' || !installed.has(d.contentId))
  const queuedBytes = downloads.filter((d) => ACTIVE.has(d.state)).reduce((n, d) => n + Math.max(0, d.sizeBytes - d.bytes), 0)
  const free = storage ? storage.freeBytes - queuedBytes : null

  const ctx: EntryCtx = { installed, pending, free, onDownload: download }

  return (
    <main className="page lib-page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <nav aria-label="Breadcrumb" className="reader-crumbs">
          <Link to="/library">Library</Link>
          <span aria-hidden="true">›</span>
          <span>Sources</span>
        </nav>
        <h1>Sources</h1>
        <p className="lead">Choose what's stored on this server. Download while you have internet; read anytime after, with or without it.</p>
      </header>

      {!initial.online && <div className="notice warn">The library server isn't running, so installed books can't be listed. Downloads still work.</div>}
      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {storage && <StorageCard storage={storage} queued={queuedBytes} />}

      {shown.length > 0 && (
        <section className="card" aria-labelledby="dls-title">
          <div className="card-head">
            <h2 id="dls-title">Downloads</h2>
            <span className="mono">ONE AT A TIME · RESUMES AFTER A RESTART</span>
          </div>
          {shown.map((d) => (
            <DownloadBar key={d.id} d={d}>
              {(d.state === 'downloading' || d.state === 'queued') && (
                <button type="button" className="tool-btn" onClick={() => run(() => controlDownload({ data: { id: d.id, action: 'pause' } }))}>
                  Pause
                </button>
              )}
              {(d.state === 'paused' || d.state === 'failed') && (
                <button type="button" className="tool-btn" onClick={() => run(() => controlDownload({ data: { id: d.id, action: 'resume' } }))}>
                  {d.state === 'failed' ? 'Try again' : 'Resume'}
                </button>
              )}
              {d.state !== 'done' && d.state !== 'verifying' && (
                <button type="button" className="tool-btn" onClick={() => run(() => controlDownload({ data: { id: d.id, action: 'cancel' } }))}>
                  Cancel
                </button>
              )}
              {d.state === 'done' && <span className="mono">ADDING TO LIBRARY…</span>}
            </DownloadBar>
          ))}
        </section>
      )}

      <section className="card" aria-labelledby="installed-title">
        <div className="card-head">
          <h2 id="installed-title">On this server</h2>
          <span className="mono">{books.length === 1 ? '1 BOOK' : `${books.length} BOOKS`}</span>
        </div>
        {books.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No books yet. Pick one below. You can also copy <code>.zim</code> files into <code>data/library</code> in Outpost's folder on the server.
          </p>
        ) : (
          <div className="rows">
            {books.map((b) => (
              <InstalledRow
                key={b.contentId}
                book={b}
                update={updates[b.contentId]}
                updating={updates[b.contentId] ? pending.has(updates[b.contentId]!.contentId) : false}
                onUpdate={(u) => download(u, b.contentId)}
                onRemove={() =>
                  run(async () => {
                    await removeBook({ data: { contentId: b.contentId } })
                    await router.invalidate()
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <GuidesSection />
      <Recommended ctx={ctx} />
      <Browse ctx={ctx} />
    </main>
  )
}

function StorageCard({ storage, queued }: { storage: StorageInfo; queued: number }) {
  const used = storage.totalBytes - storage.freeBytes
  const other = Math.max(0, used - storage.libraryBytes)
  const seg = (b: number) => `${Math.max(0, (b / storage.totalBytes) * 100)}%`
  return (
    <section className="card" aria-labelledby="storage-title">
      <div className="card-head">
        <h2 id="storage-title">Storage</h2>
        <span className="big-number" style={{ fontSize: 28 }}>
          {formatBytes(storage.freeBytes)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>free</span>
        </span>
      </div>
      <div
        className="storage-bar"
        role="img"
        aria-label={`Library ${formatBytes(storage.libraryBytes)}, everything else ${formatBytes(other)}, ${formatBytes(storage.freeBytes)} free of ${formatBytes(storage.totalBytes)}${queued ? `, ${formatBytes(queued)} still to download` : ''}.`}
      >
        <span style={{ width: seg(storage.libraryBytes), background: 'var(--dusk)' }} />
        <span style={{ width: seg(other), background: 'var(--muted-dot)' }} />
        {queued > 0 && <span className="queued" style={{ width: seg(Math.min(queued, storage.freeBytes)) }} />}
      </div>
      <div className="strip-legend" style={{ fontSize: 13 }}>
        <span>
          <span aria-hidden="true" className="swatch bar" style={{ background: 'var(--dusk)' }} />
          Library {formatBytes(storage.libraryBytes)}
        </span>
        <span>
          <span aria-hidden="true" className="swatch bar" style={{ background: 'var(--muted-dot)' }} />
          Everything else {formatBytes(other)}
        </span>
        {queued > 0 && (
          <span>
            <span aria-hidden="true" className="swatch bar queued" />
            Still to download {formatBytes(queued)}
          </span>
        )}
        <span className="muted">
          {percent(used, storage.totalBytes)}% of {formatBytes(storage.totalBytes)} used
        </span>
      </div>
    </section>
  )
}

function InstalledRow({ book, update, updating, onUpdate, onRemove }: { book: Book; update?: CatalogEntry; updating: boolean; onUpdate: (u: CatalogEntry) => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="row lib-installed">
      <span style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
        <BookIcon uuid={book.uuid} title={book.title} size={36} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <strong>{book.title}</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {isAppBook(book) ? 'Map' : flavourLabel(book.flavour)} · {monthYear(book.date)}
            {isAppBook(book) ? '' : ` · ${count(book.articleCount)} articles`}{book.sizeBytes ? ` · ${formatBytes(book.sizeBytes)}` : ''}
          </span>
        </span>
      </span>
      <span className="dl-actions">
        {update && (
          <button type="button" className="tool-btn accent" disabled={updating} onClick={() => onUpdate(update)} title={`Downloads the ${monthYear(update.date)} edition, then removes this one.`}>
            {updating ? 'Updating…' : `Update to ${monthYear(update.date)}`}
          </button>
        )}
        <button
          type="button"
          className={`tool-btn${confirm ? ' danger' : ''}`}
          onBlur={() => setConfirm(false)}
          onClick={() => (confirm ? onRemove() : setConfirm(true))}
          aria-label={confirm ? `Remove ${book.title} for good` : `Remove ${book.title}`}
        >
          {confirm ? `Delete ${book.sizeBytes ? formatBytes(book.sizeBytes) : 'it'}?` : 'Remove'}
        </button>
      </span>
    </div>
  )
}

interface EntryCtx {
  installed: Set<string>
  pending: Map<string, Download>
  free: number | null
  onDownload: (e: CatalogEntry) => void
}

/** What a catalogue entry's button says, and whether it can be pressed. */
function entryState(e: CatalogEntry, ctx: EntryCtx): { label: string; disabled: boolean; note?: string } {
  if (ctx.installed.has(e.contentId)) return { label: 'Installed', disabled: true }
  const p = ctx.pending.get(e.contentId)
  if (p) return { label: p.state === 'paused' || p.state === 'failed' ? 'Resume' : p.state === 'queued' ? 'Waiting' : 'Downloading', disabled: !(p.state === 'paused' || p.state === 'failed') }
  if (ctx.free !== null && e.sizeBytes > ctx.free - MARGIN) return { label: 'Not enough space', disabled: true, note: `Needs ${formatBytes(e.sizeBytes)}, ${formatBytes(Math.max(0, ctx.free))} free` }
  return { label: `Download ${formatBytes(e.sizeBytes)}`, disabled: false }
}

function Recommended({ ctx }: { ctx: EntryCtx }) {
  const [state, setState] = useState<{ list: Recommendation[] } | { error: string } | null>(null)
  useEffect(() => {
    getRecommended()
      .then((r) => setState(r.ok ? { list: r.list } : { error: r.error }))
      .catch((err: Error) => setState({ error: err.message }))
  }, [])
  return (
    <section aria-labelledby="rec-title" className="lib-section">
      <div className="section-head">
        <h2 id="rec-title">Recommended</h2>
        <span className="mono">FROM KIWIX · UPDATED MONTHLY</span>
      </div>
      {state === null ? (
        <div className="rec-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rec-card skeleton" />
          ))}
        </div>
      ) : 'error' in state ? (
        <div className="notice warn">{state.error}</div>
      ) : (
        <>
          <div className="rec-grid">
            {state.list
              .filter((r) => r.group === 'essentials')
              .map((r) => (
                <RecCard key={r.name} rec={r} ctx={ctx} />
              ))}
          </div>
          {state.list.some((r) => r.group === 'prepare') && (
            <>
              <div className="section-head" style={{ marginTop: 18 }}>
                <h2 id="prep-title">Be prepared</h2>
                <span className="mono">MAPS, WATER, FOOD AND AFTER A DISASTER</span>
              </div>
              <div className="rec-grid">
                {state.list
                  .filter((r) => r.group === 'prepare')
                  .map((r) => (
                    <RecCard key={r.name} rec={r} ctx={ctx} />
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function RecCard({ rec, ctx }: { rec: Recommendation; ctx: EntryCtx }) {
  // Start on whichever version is already here or on its way, else the best that fits.
  const initial =
    rec.options.find((o) => ctx.installed.has(o.contentId) || ctx.pending.has(o.contentId)) ??
    rec.options.find((o) => ctx.free === null || o.sizeBytes < ctx.free - MARGIN) ??
    rec.options[0]!
  const [pick, setPick] = useState(initial.contentId)
  const chosen = rec.options.find((o) => o.contentId === pick) ?? initial
  const s = entryState(chosen, ctx)
  return (
    <article className="rec-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <BookIcon src={chosen.icon} title={rec.title} size={40} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: 17 }}>{rec.title}</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {count(chosen.articleCount)} articles · {monthYear(chosen.date)}
          </span>
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        {rec.why}
      </p>
      {rec.options.length > 1 && (
        <div className="flavours" role="radiogroup" aria-label={`${rec.title} version`}>
          {rec.options.map((o) => (
            <button key={o.contentId} type="button" role="radio" aria-checked={o.contentId === pick} onClick={() => setPick(o.contentId)}>
              <span>{flavourLabel(o.flavour)}</span>
              <span className="muted">{formatBytes(o.sizeBytes)}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className={`btn ${s.disabled ? 'secondary' : 'accent'}`} disabled={s.disabled} onClick={() => ctx.onDownload(chosen)} style={{ marginTop: 'auto' }}>
        {s.label}
      </button>
      {s.note && (
        <span className="muted" style={{ fontSize: 12 }}>
          {s.note}
        </span>
      )}
    </article>
  )
}

function Browse({ ctx }: { ctx: EntryCtx }) {
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('eng')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState<CatalogPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(
    async (start: number) => {
      setLoading(true)
      setError(null)
      try {
        const r = await browseCatalog({ data: { q, lang: lang === 'all' ? '' : lang, category, start } })
        if (!r.ok) setError(r.error)
        else setPage((old) => (start > 0 && old ? { ...r.page, entries: [...old.entries, ...r.page.entries] } : r.page))
      } finally {
        setLoading(false)
      }
    },
    [q, lang, category],
  )

  useEffect(() => {
    if (open) void load(0)
    // Only re-run when the filters (not the query text) change; the form submits the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang, category])

  return (
    <section className="card" aria-labelledby="browse-title">
      <div className="card-head">
        <h2 id="browse-title">Browse everything</h2>
        <span className="mono">{page ? `${count(page.total)} IN KIWIX'S CATALOGUE` : 'THOUSANDS OF COLLECTIONS'}</span>
      </div>
      {!open ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <p className="muted" style={{ margin: 0, flex: 1, minWidth: 240 }}>
            Stack Exchange sites, Project Gutenberg, TED talks, other languages and more. Needs the internet.
          </p>
          <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
            Browse the catalogue
          </button>
        </div>
      ) : (
        <>
          <form
            className="browse-form"
            onSubmit={(e) => {
              e.preventDefault()
              void load(0)
            }}
          >
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, e.g. cooking" aria-label="Search the catalogue" />
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {LANGUAGES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind">
              {CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button type="submit" className="btn accent" disabled={loading}>
              Search
            </button>
          </form>
          {error && <div className="notice warn">{error}</div>}
          {page && page.entries.length === 0 && <p className="muted">Nothing in the catalogue matches.</p>}
          {page && page.entries.length > 0 && (
            <div className="rows">
              {page.entries.map((e) => {
                const s = entryState(e, ctx)
                return (
                  <div key={e.contentId} className="row lib-installed">
                    <span style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
                      <BookIcon src={e.icon} title={e.title} size={36} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <strong>{e.title}</strong>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {e.summary}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {flavourLabel(e.flavour)} · {monthYear(e.date)} · {count(e.articleCount)} articles
                        </span>
                      </span>
                    </span>
                    <button type="button" className={`tool-btn${s.disabled ? '' : ' accent'}`} disabled={s.disabled} onClick={() => ctx.onDownload(e)} title={s.note}>
                      {s.label}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {page && page.entries.length < page.total && (
            <button type="button" className="btn secondary" style={{ alignSelf: 'center' }} disabled={loading} onClick={() => load(page.entries.length)}>
              {loading ? 'Loading…' : 'Show more'}
            </button>
          )}
        </>
      )}
    </section>
  )
}
