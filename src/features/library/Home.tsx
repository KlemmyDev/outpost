import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { formatBytes } from '#/platform/ui/format'
import { ago, articles, count, monthYear, readHref } from './format'
import { TOPICS, type TopicSummary } from './hub'
import { getHubFeed, getTopicSummaries, randomArticle, type HubFeed } from './library.functions'
import { CardSkeleton, PreviewCard, TopicIcon, TopicTile } from './ui/HubCards'
import { BookIcon } from './ui/BookIcon'
import { DownloadBar } from './ui/DownloadBar'
import { ReadLink } from './ui/ReadLink'
import { SearchBox } from './ui/SearchBox'
import { GUIDES_BOOK } from './guides/catalog'
import { flavourLabel, isAppBook, type Book, type LibraryHome } from './types'

export function LibraryHomePage({ data, feed: initialFeed }: { data: LibraryHome; feed: HubFeed | null }) {
  const { books, history, saved, downloads, online } = data
  const [feed, setFeed] = useState(initialFeed)
  const [shuffling, setShuffling] = useState(false)
  const [topics, setTopics] = useState<TopicSummary[] | null>(null)
  const readable = books.filter((b) => !isAppBook(b))
  useEffect(() => {
    if (!online || readable.length === 0) return
    let live = true
    void getTopicSummaries()
      .then((t) => live && setTopics(t))
      .catch(() => live && setTopics([]))
    if (!initialFeed) void getHubFeed({ data: {} }).then((f) => live && setFeed(f)).catch(() => {})
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, readable.length])
  async function shuffle() {
    setShuffling(true)
    try {
      setFeed(await getHubFeed({ data: { fresh: true } }))
    } finally {
      setShuffling(false)
    }
  }
  const picks = feed?.discover.items ?? []
  const recent = new Map((feed?.recent ?? []).map((p) => [`${p.contentId}/${p.path}`, p]))
  const articles = books.reduce((n, b) => n + b.articleCount, 0)
  const bytes = books.reduce((n, b) => n + (b.sizeBytes ?? 0), 0)
  const active = downloads.filter((d) => d.state === 'downloading' || d.state === 'verifying' || d.state === 'queued')

  return (
    <main className="page lib-page">
      <header className="lib-hero">
        <span className="eyebrow">ARCHIVE · {books.length === 1 ? '1 BOOK' : `${books.length} BOOKS`} · WORKS OFFLINE</span>
        <h1>Library</h1>
        <p className="lead">
          {books.length > 0
            ? `${count(articles)} articles from ${books.length === 1 ? books[0]!.title : `${books.length} collections`}, ${formatBytes(bytes)} on this server.`
            : 'Wikipedia, medical references, guides and recipes, stored on this server so they work with no internet.'}
        </p>
        {online && books.length > 0 && <SearchBox large placeholder={`Search ${books.length === 1 ? books[0]!.title : 'every book'}`} />}
        {online && readable.length > 0 && (
          <nav className="hub-chips" aria-label="Topics">
            {TOPICS.map((t) => (
              <Link key={t.id} to="/library/topic/$topic" params={{ topic: t.id }} className={`hub-chip t-${t.id}`}>
                <TopicIcon name={t.icon} size={16} />
                {t.title}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {!online && (
        <div className="notice warn">
          The library server isn't running, so books can't be opened right now. It starts with Outpost; if it stays off, run{' '}
          <code>docker compose up -d kiwix</code> in Outpost's folder on the server.
        </div>
      )}

      {online && books.length === 0 && (
        <section className="card lib-empty" aria-labelledby="empty-title">
          <div className="lib-empty-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id="empty-title">Nothing on the shelves yet</h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55, maxWidth: 520 }}>
              {active.length > 0
                ? `${active[0]!.title} is on its way. It appears here as soon as it's finished.`
                : 'Pick a few collections to download while you have internet. Start small (WikiMed is about 2 GB) or go big with all of Wikipedia.'}
            </p>
            <Link to="/library/sources" className="btn accent" style={{ alignSelf: 'flex-start' }}>
              Choose books
            </Link>
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="card" aria-labelledby="dl-title">
          <div className="card-head">
            <h2 id="dl-title">Downloading</h2>
            <Link to="/library/sources" className="muted" style={{ fontSize: 14 }}>
              Manage ›
            </Link>
          </div>
          {active.slice(0, 4).map((d) => (
            <DownloadBar key={d.id} d={d} />
          ))}
          {active.length > 4 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>And {active.length - 4} more waiting.</p>}
        </section>
      )}

      {online && readable.length > 0 && (
        <section aria-labelledby="today-title" className="lib-section">
          <div className="section-head">
            <h2 id="today-title">Today in the library</h2>
            <button type="button" className="link-btn" onClick={shuffle} disabled={shuffling}>
              {shuffling ? 'Finding more…' : 'Shuffle'}
            </button>
          </div>
          {feed === null || shuffling ? (
            <div className="hub-today">
              <CardSkeleton size="lg" />
              <div className="hub-today-side">
                {[0, 1, 2, 3].map((i) => (
                  <CardSkeleton key={i} size="sm" />
                ))}
              </div>
            </div>
          ) : picks.length === 0 ? (
            <p className="muted">Nothing to pick from yet. Books with articles show their pages here, a few each day.</p>
          ) : (
            <div className="hub-today">
              <PreviewCard p={picks[0]!} size="lg" />
              {picks.length > 1 && (
                <div className={`hub-today-side n${Math.min(picks.length - 1, 4)}`}>
                  {picks.slice(1, 5).map((p) => (
                    <PreviewCard key={`${p.contentId}/${p.path}`} p={p} size="sm" />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {online && readable.length > 0 && (
        <section aria-labelledby="topics-title" className="lib-section">
          <div className="section-head">
            <h2 id="topics-title">Explore by topic</h2>
            <span className="muted hub-hint" style={{ fontSize: 14 }}>
              From every book at once
            </span>
          </div>
          <div className="hub-topics">
            {TOPICS.map((t) => (
              <TopicTile key={t.id} t={t} s={topics === null ? null : (topics.find((x) => x.id === t.id) ?? { id: t.id, count: 0, images: [] })} />
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="continue-title" className="lib-section">
          <div className="section-head">
            <h2 id="continue-title">Continue reading</h2>
            <Link to="/library/saved" search={{ tab: 'history' }} className="muted">
              History ›
            </Link>
          </div>
          <div className="hub-row">
            {history.slice(0, 4).map((h) => {
              const p = recent.get(`${h.contentId}/${h.path}`)
              return p ? (
                <PreviewCard key={`${h.contentId}/${h.path}`} p={{ ...p, title: h.title }} size="sm" />
              ) : (
                <ReadLink key={`${h.contentId}/${h.path}`} book={h.contentId} path={h.path} className="lib-recent-card">
                  <span className="mono">{h.bookTitle.toUpperCase()}</span>
                  <strong>{h.title}</strong>
                  <span className="muted">{ago(h.visitedAt)}</span>
                </ReadLink>
              )
            })}
          </div>
        </section>
      )}

      {books.length > 0 && (
        <section aria-labelledby="books-title" className="lib-section">
          <div className="section-head">
            <h2 id="books-title">Your collections</h2>
            <Link to="/library/sources" className="muted">
              Add books ›
            </Link>
          </div>
          <div className="lib-shelf">
            {books.map((b) => (
              <BookCard key={b.contentId} book={b} />
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="card" aria-labelledby="saved-title">
          <div className="card-head">
            <h2 id="saved-title">Saved</h2>
            <Link to="/library/saved" search={{ tab: 'saved' }} className="muted" style={{ fontSize: 14 }}>
              See all ›
            </Link>
          </div>
          <div className="rows">
            {saved.map((s) => (
              <ReadLink key={`${s.contentId}/${s.path}`} book={s.contentId} path={s.path} className="row lib-row-link">
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong>{s.title}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {s.bookTitle}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {ago(s.savedAt)}
                </span>
              </ReadLink>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function BookCard({ book }: { book: Book }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  async function surprise() {
    setBusy(true)
    try {
      const r = await randomArticle({ data: { book: book.contentId } })
      if (r) await navigate({ href: readHref(r.book, r.path) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="lib-book">
      <ReadLink book={book.contentId} path="" className="lib-book-main">
        <BookIcon uuid={book.uuid} title={book.title} size={44} />
        <span className="lib-book-text">
          <strong>{book.title}</strong>
          <span className="muted">{book.summary}</span>
        </span>
      </ReadLink>
      <div className="lib-book-foot">
        <span className="mono">
          {(book.contentId === GUIDES_BOOK ? 'Saved' : isAppBook(book) ? 'Map' : flavourLabel(book.flavour)).toUpperCase()} · {monthYear(book.date).toUpperCase()}
        </span>
        <span className="muted">
          {book.contentId === GUIDES_BOOK ? `${book.articleCount} guides` : isAppBook(book) ? 'Opens in its own viewer' : articles(book.articleCount)}
          {book.sizeBytes ? ` · ${formatBytes(book.sizeBytes)}` : ''}
        </span>
        {!isAppBook(book) && (
          <button type="button" className="link-btn" onClick={surprise} disabled={busy}>
            {busy ? 'Finding one…' : book.contentId === GUIDES_BOOK ? 'Random guide' : 'Random article'}
          </button>
        )}
      </div>
    </article>
  )
}
