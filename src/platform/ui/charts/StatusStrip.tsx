import { useState, type KeyboardEvent } from 'react'

export type StripState = 'online' | 'degraded' | 'offline' | null

export const STRIP_COLORS: Record<'online' | 'degraded' | 'offline' | 'none', string> = {
  online: 'var(--eucalypt)',
  degraded: 'var(--ochre)',
  offline: 'var(--flare)',
  none: 'var(--line-soft)',
}

const WORDS = { online: 'Online', degraded: 'Struggling', offline: 'Down', none: 'No data' }

/**
 * A timeline of health: one bar per time bucket, coloured by what best
 * describes it. Hover or use the arrow keys to read a bar, click or press
 * Enter to keep it showing. The legend names every colour, so it's never
 * colour alone. `highlight` outlines the bars inside a span of time.
 */
export function StatusStrip({
  items,
  formatTime,
  label,
  highlight,
}: {
  items: { t: number; state: StripState; detail?: string }[]
  formatTime: (t: number) => string
  label: string
  highlight?: { from: number; to: number } | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = pinned ?? hover
  const counts = { online: 0, degraded: 0, offline: 0, none: 0 }
  for (const i of items) counts[i.state ?? 'none']++
  const summary = `${label}: ${counts.online} online, ${counts.degraded} struggling, ${counts.offline} down, ${counts.none} without data. Arrow keys read each bar.`
  const h = active !== null ? items[active] : undefined
  const step = items.length > 1 ? items[1]!.t - items[0]!.t : 0
  const inBand = (t: number) => !!highlight && t + step > highlight.from && t <= highlight.to

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const n = items.length
    if (n === 0) return
    const set = (i: number) => (pinned !== null ? setPinned(i) : setHover(i))
    if (e.key === 'ArrowRight') set(Math.min(n - 1, (active ?? -1) + 1))
    else if (e.key === 'ArrowLeft') set(Math.max(0, (active ?? n) - 1))
    else if (e.key === 'Home') set(0)
    else if (e.key === 'End') set(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') setPinned((p) => (p === null ? (hover ?? n - 1) : null))
    else if (e.key === 'Escape') {
      setPinned(null)
      setHover(null)
    } else return
    e.preventDefault()
  }

  return (
    <div className="strip-wrap">
      <div
        className="strip"
        role="img"
        tabIndex={0}
        aria-label={summary}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        {items.map((it, i) => (
          <span
            key={it.t}
            className={`${active === i ? 'on' : ''}${inBand(it.t) ? ' band' : ''}`}
            style={{
              background: STRIP_COLORS[it.state ?? 'none'],
              opacity: active === null || active === i ? 1 : 0.5,
              animationDelay: `${Math.min(0.5, (i / Math.max(1, items.length)) * 0.5)}s`,
            }}
            onPointerEnter={() => setHover(i)}
            onClick={() => setPinned((p) => (p === i ? null : i))}
          />
        ))}
      </div>
      <div className="strip-foot" aria-live="polite">
        {h ? (
          <span>
            <strong>{formatTime(h.t)}</strong> · {WORDS[h.state ?? 'none']}
            {h.detail ? ` · ${h.detail}` : ''}
            {pinned !== null && <span className="muted"> · pinned, click again to let go</span>}
          </span>
        ) : (
          <span className="strip-legend">
            {(['online', 'degraded', 'offline', 'none'] as const).map((k) => (
              <span key={k}>
                <span aria-hidden="true" className="swatch bar" style={{ background: STRIP_COLORS[k] }} />
                {WORDS[k]}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
