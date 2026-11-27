import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ago } from './format'
import { forgetHistory, setBookmark } from './library.functions'
import { ReadLink } from './ui/ReadLink'
import type { Bookmark, HistoryItem } from './types'

export type SavedTab = 'saved' | 'history'

export function SavedPage({ tab, saved, history }: { tab: SavedTab; saved: Bookmark[]; history: HistoryItem[] }) {
  const router = useRouter()
  const [confirmClear, setConfirmClear] = useState(false)
  const list = tab === 'saved' ? saved : history

  async function remove(item: Bookmark | HistoryItem) {
    if (tab === 'saved') await setBookmark({ data: { book: item.contentId, path: item.path, title: item.title, bookTitle: item.bookTitle, saved: false } })
    else await forgetHistory({ data: { book: item.contentId, path: item.path } })
    await router.invalidate()
  }

  return (
    <main className="page lib-page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <nav aria-label="Breadcrumb" className="reader-crumbs">
          <Link to="/library">Library</Link>
          <span aria-hidden="true">›</span>
          <span>{tab === 'saved' ? 'Saved' : 'History'}</span>
        </nav>
        <h1>{tab === 'saved' ? 'Saved for later' : 'Reading history'}</h1>
        <p className="lead">
          {tab === 'saved' ? 'Articles you saved, newest first. Save one from the reader’s toolbar.' : `The last ${history.length === 1 ? 'page' : `${history.length} pages`} opened on this server, by anyone using it.`}
        </p>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="segmented" role="group" aria-label="Show">
          <Link to="/library/saved" search={{ tab: 'saved' }} aria-pressed={tab === 'saved'} className="seg-link" replace>
            Saved · {saved.length}
          </Link>
          <Link to="/library/saved" search={{ tab: 'history' }} aria-pressed={tab === 'history'} className="seg-link" replace>
            History · {history.length}
          </Link>
        </div>
        {tab === 'history' && history.length > 0 && (
          <button
            type="button"
            className={`btn ${confirmClear ? 'danger' : 'secondary'}`}
            onBlur={() => setConfirmClear(false)}
            onClick={async () => {
              if (!confirmClear) return setConfirmClear(true)
              await forgetHistory({ data: { all: true } })
              setConfirmClear(false)
              await router.invalidate()
            }}
          >
            {confirmClear ? 'Clear all history?' : 'Clear history'}
          </button>
        )}
      </div>
      <section className="card">
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {tab === 'saved' ? 'Nothing saved yet.' : 'No history yet.'}
          </p>
        ) : (
          <div className="rows">
            {list.map((item) => (
              <div key={`${item.contentId}/${item.path}`} className="row">
                <ReadLink book={item.contentId} path={item.path} className="lib-row-link grow">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong>{item.title}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {item.bookTitle} · {ago('savedAt' in item ? item.savedAt : item.visitedAt)}
                    </span>
                  </span>
                </ReadLink>
                <button type="button" className="link-btn" onClick={() => remove(item)} aria-label={`Remove ${item.title}`}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
