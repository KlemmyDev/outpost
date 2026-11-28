import { Link } from '@tanstack/react-router'
import { BookIcon } from './ui/BookIcon'
import { PreviewCard, TopicIcon } from './ui/HubCards'
import { ReadLink } from './ui/ReadLink'
import { SearchBox } from './ui/SearchBox'
import { TOPICS, type Topic, type TopicReads } from './hub'

/** One subject, gathered from every book: the best page for each of its questions. */
export function TopicPage({ t, data }: { t: Topic; data: TopicReads | null }) {
  const reads = data?.reads ?? []
  const [lead, ...rest] = reads
  return (
    <main className="page lib-page hub-topic-page">
      <nav aria-label="Breadcrumb" className="reader-crumbs">
        <Link to="/library">Library</Link>
        <span aria-hidden="true">›</span>
        <span>Topics</span>
      </nav>
      <header className={`hub-topic-head t-${t.id}`}>
        <span className="hub-topic-badge">
          <TopicIcon name={t.icon} size={28} />
        </span>
        <div>
          <h1>{t.title}</h1>
          <p className="lead">{t.blurb}</p>
        </div>
      </header>
      <SearchBox placeholder={`Search every book about ${t.title.toLowerCase()}`} />

      {reads.length === 0 ? (
        <section className="card lib-empty" aria-labelledby="none-title">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id="none-title">Nothing on the shelves covers this yet</h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
              Pages about {t.title.toLowerCase()} show up here from any book you add. Try {t.suggest}.
            </p>
            <Link to="/library/sources" className="btn accent" style={{ alignSelf: 'flex-start' }}>
              Choose books
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Start here" className="hub-topic-lead">
            <PreviewCard p={lead!} size="lg" />
          </section>
          {rest.length > 0 && (
            <section aria-labelledby="reads-title" className="lib-section">
              <h2 id="reads-title">More to read</h2>
              <div className="hub-grid">
                {rest.map((p) => (
                  <PreviewCard key={`${p.contentId}/${p.path}`} p={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="ask-title" className="lib-section">
        <h2 id="ask-title">Look up</h2>
        <div className="hub-chips">
          {t.queries.map((q) => (
            <Link key={q} to="/library/search" search={{ q }} className="hub-chip">
              {q}
            </Link>
          ))}
        </div>
      </section>

      {data && data.books.length > 0 && (
        <section aria-labelledby="cols-title" className="lib-section">
          <h2 id="cols-title">Collections about this</h2>
          <div className="hub-chips">
            {data.books.map((b) => (
              <ReadLink key={b.contentId} book={b.contentId} path="" className="hub-chip book">
                <BookIcon uuid={b.uuid || undefined} title={b.title} size={20} />
                {b.title}
              </ReadLink>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="other-title" className="lib-section">
        <h2 id="other-title">Other topics</h2>
        <div className="hub-chips">
          {TOPICS.filter((x) => x.id !== t.id).map((x) => (
            <Link key={x.id} to="/library/topic/$topic" params={{ topic: x.id }} className={`hub-chip t-${x.id}`}>
              <TopicIcon name={x.icon} size={16} />
              {x.title}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
