import { Link, useRouteContext, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { WIDGETS } from '#/platform/features/widgets'
import type { OverviewData } from '#/platform/overview.types'
import { Sheet } from '#/platform/ui/Sheet'
import { ServerCard, ServerDetail } from './ServerWidget'

const REFRESH_MS = 60_000

/** One plain sentence about what matters most right now. */
function summary(data: OverviewData): string {
  const net = data.widgets.internet
  if (net?.state === 'offline') return 'The internet is down. Everything in Outpost still works offline.'
  if (net?.state === 'degraded') return 'The internet is patchy right now.'
  if (data.server.updateAvailable && data.server.latestVersion) return `Version ${data.server.latestVersion} is ready to install.`
  return 'Everything is running normally.'
}

/** Date and time on the client only, so the server's time zone can't disagree with yours. */
function useClock(): string {
  const [now, setNow] = useState<string>('')
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date()
          .toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
          .toUpperCase(),
      )
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function OverviewPage({ data }: { data: OverviewData }) {
  const { platform } = useRouteContext({ from: '__root__' })
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const clock = useClock()

  // Keep the cards fresh while the page is open, but not while a panel is open.
  useEffect(() => {
    if (open) return
    const t = setInterval(() => void router.invalidate(), REFRESH_MS)
    return () => clearInterval(t)
  }, [router, open])

  const cards = platform.features.filter((f) => f.enabled && WIDGETS[f.id])
  const libraryOn = platform.features.some((f) => f.id === 'library' && f.enabled)
  const openFeature = open && open !== 'server' ? cards.find((f) => f.id === open) : undefined
  const OpenDetail = openFeature ? WIDGETS[openFeature.id]?.Detail : undefined

  return (
    <main className="page">
      <section className="overview-hero">
        <svg className="hero-arcs" width="520" height="220" viewBox="0 0 520 220" aria-hidden="true">
          <path
            d="M350 170 A30 30 0 0 1 410 170 M320 170 A60 60 0 0 1 440 170 M290 170 A90 90 0 0 1 470 170 M260 170 A120 120 0 0 1 500 170 M230 170 A150 150 0 0 1 530 170"
            fill="none"
            stroke="#e6d8c4"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M120 196 H520" stroke="#e6d8c4" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="380" cy="170" r="6" fill="var(--ochre)" />
        </svg>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow" style={{ minHeight: '1.2em' }}>
            {clock}
          </span>
          <h1>
            G’day. All quiet
            <br />
            at the outpost.
          </h1>
          <p className="lead">{summary(data)}</p>
        </div>
        {libraryOn && (
          <form action="/library" method="get" role="search" style={{ position: 'relative', flex: '0 1 400px', display: 'flex' }}>
            <label htmlFor="overview-search" className="visually-hidden">
              Search the library
            </label>
            <input id="overview-search" name="q" type="search" className="search-pill" placeholder="Search Wikipedia, first aid, recipes…" />
          </form>
        )}
      </section>

      <section className="overview-grid" aria-label="At a glance">
        {cards.map((f, i) => {
          const W = WIDGETS[f.id]!
          return (
            <FragmentWithServer key={f.id} first={i === 0} stats={data} onServer={() => setOpen('server')}>
              <W.Card feature={f} data={data.widgets} onOpen={() => setOpen(f.id)} />
            </FragmentWithServer>
          )
        })}
        {cards.length === 0 && <ServerCard stats={data.server} onOpen={() => setOpen('server')} />}
      </section>

      {platform.features.some((f) => !f.enabled && !f.core) && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Some features are switched off.{' '}
          <Link to="/settings" hash="features">
            Choose features
          </Link>
        </p>
      )}

      {open === 'server' && (
        <Sheet title="Home server" onClose={() => setOpen(null)}>
          <ServerDetail stats={data.server} />
        </Sheet>
      )}
      {openFeature && OpenDetail && (
        <Sheet title={openFeature.name} onClose={() => setOpen(null)}>
          <OpenDetail feature={openFeature} data={data.widgets} />
        </Sheet>
      )}
    </main>
  )
}

/** Puts the Home server card second, right after the first feature card. */
function FragmentWithServer({
  first,
  stats,
  onServer,
  children,
}: {
  first: boolean
  stats: OverviewData
  onServer: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      {first && <ServerCard stats={stats.server} onOpen={onServer} />}
    </>
  )
}
