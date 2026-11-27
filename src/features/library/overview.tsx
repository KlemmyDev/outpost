import { Link } from '@tanstack/react-router'
import { formatBytes, percent } from '#/platform/ui/format'
import { Meter, SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'
import { count } from './format'

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data.library
    const dl = s?.download
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone="dusk"
        value={!s ? '—' : s.books === 0 ? (dl ? 'Downloading' : 'Empty') : count(s.articles)}
        caption={
          !s
            ? "Couldn't read the library."
            : !s.online
              ? "The library server isn't running."
              : s.books === 0
                ? dl
                  ? `${dl.title}, ${percent(dl.bytes, dl.sizeBytes)}%`
                  : 'Nothing downloaded yet.'
                : `articles in ${s.books === 1 ? '1 book' : `${s.books} books`}`
        }
        visual={
          dl ? (
            <div className="meter-track" aria-hidden="true">
              <div style={{ width: `${percent(dl.bytes, dl.sizeBytes)}%`, background: 'var(--dusk)' }} />
            </div>
          ) : undefined
        }
        footer={
          s && s.books > 0
            ? dl
              ? `Downloading ${dl.title}, ${percent(dl.bytes, dl.sizeBytes)}%`
              : `${formatBytes(s.bytes)} readable offline`
            : 'Wikipedia, WikiMed and guides, readable offline'
        }
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data.library
    const dl = s?.download
    return (
      <>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {s && s.books > 0
            ? `${count(s.articles)} articles across ${s.books === 1 ? 'one book' : `${s.books} books`}, taking ${formatBytes(s.bytes)}. Everything opens with no internet.`
            : 'The library stores whole collections on this server, like Wikipedia and WikiMed, so they work with no internet. Choose them under Sources.'}
        </p>
        {dl && (
          <Meter
            label={dl.state === 'verifying' ? `Checking ${dl.title}` : `Downloading ${dl.title}`}
            value={percent(dl.bytes, dl.sizeBytes)}
            detail={`${formatBytes(dl.bytes)} of ${formatBytes(dl.sizeBytes)}${s && s.queued ? ` · ${s.queued} more waiting` : ''}`}
          />
        )}
        {s && !s.online && <div className="notice warn">The library server isn't running, so books can't be opened right now.</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/library" className="btn accent">
            Open Library
          </Link>
          <Link to="/library/sources" className="btn secondary">
            Sources
          </Link>
        </div>
      </>
    )
  },
}
