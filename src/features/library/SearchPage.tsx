import { Link } from '@tanstack/react-router'
import { count } from './format'
import { ReadLink } from './ui/ReadLink'
import { SearchBox } from './ui/SearchBox'
import type { SearchResults } from './types'

export function SearchPage({ results, book }: { results: SearchResults; book: string }) {
  const { query, groups } = results
  const total = groups.reduce((n, g) => n + g.total, 0)
  const one = book ? groups[0] : undefined
  return (
    <main className="page lib-page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <nav aria-label="Breadcrumb" className="reader-crumbs">
          <Link to="/library">Library</Link>
          <span aria-hidden="true">›</span>
          <span>Search</span>
        </nav>
        <SearchBox initial={query} autoFocus={!query} />
      </header>

      {query && (
        <p className="lead" role="status" style={{ margin: 0 }}>
          {total === 0
            ? `Nothing matches “${query}”${book ? ' in this book' : ''}. Try fewer or different words.`
            : one
              ? `${count(one.total)} pages in ${one.bookTitle} match “${query}”.`
              : `${count(total)} pages match “${query}”${groups.length > 1 ? ` across ${groups.length} books` : ''}.`}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.contentId} className="card" aria-labelledby={`g-${g.contentId}`}>
          <div className="card-head">
            <h2 id={`g-${g.contentId}`}>{g.bookTitle}</h2>
            <span className="mono">{count(g.total)} RESULTS</span>
          </div>
          <ol className="hits" start={results.start + 1}>
            {g.hits.map((h) => (
              <li key={h.path}>
                <ReadLink book={h.contentId} path={h.path} className="hit">
                  <strong>{h.title}</strong>
                  {h.snippet && <span className="muted">{h.snippet}</span>}
                </ReadLink>
              </li>
            ))}
          </ol>
          {!book && g.total > g.hits.length && (
            <Link to="/library/search" search={{ q: query, book: g.contentId }} className="btn secondary" style={{ alignSelf: 'flex-start' }}>
              All {count(g.total)} from {g.bookTitle}
            </Link>
          )}
          {book && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {results.start > 0 && (
                <Link to="/library/search" search={{ q: query, book, start: Math.max(0, results.start - results.pageLength) }} className="btn secondary">
                  ‹ Previous
                </Link>
              )}
              {results.start + results.pageLength < g.total && (
                <Link to="/library/search" search={{ q: query, book, start: results.start + results.pageLength }} className="btn secondary">
                  Next ›
                </Link>
              )}
              <span className="muted" style={{ fontSize: 13 }}>
                {results.start + 1}–{Math.min(g.total, results.start + results.pageLength)} of {count(g.total)}
              </span>
              <Link to="/library/search" search={{ q: query }} className="muted" style={{ marginLeft: 'auto', fontSize: 14 }}>
                Search every book
              </Link>
            </div>
          )}
        </section>
      ))}
    </main>
  )
}
