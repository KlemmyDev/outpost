import { useState } from 'react'

export type StripState = 'online' | 'degraded' | 'offline' | null

export const STRIP_COLORS: Record<'online' | 'degraded' | 'offline' | 'none', string> = {
  online: 'var(--eucalypt)',
  degraded: 'var(--ochre)',
  offline: 'var(--flare)',
  none: 'var(--line-soft)',
}

const WORDS = { online: 'Online', degraded: 'Struggling', offline: 'Down', none: 'No data' }

/**
 * A timeline of health: one bar per time bucket, coloured by the worst thing
 * that happened in it. The legend names every colour, so it's never colour alone.
 */
export function StatusStrip({
  items,
  formatTime,
  label,
}: {
  items: { t: number; state: StripState; detail?: string }[]
  formatTime: (t: number) => string
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const counts = { online: 0, degraded: 0, offline: 0, none: 0 }
  for (const i of items) counts[i.state ?? 'none']++
  const summary = `${label}: ${counts.online} online, ${counts.degraded} struggling, ${counts.offline} down, ${counts.none} without data.`
  const h = hover !== null ? items[hover] : undefined

  return (
    <div className="strip-wrap">
      <div className="strip" role="img" aria-label={summary} onPointerLeave={() => setHover(null)}>
        {items.map((it, i) => (
          <span
            key={it.t}
            style={{ background: STRIP_COLORS[it.state ?? 'none'], opacity: hover === null || hover === i ? 1 : 0.55 }}
            onPointerEnter={() => setHover(i)}
          />
        ))}
      </div>
      <div className="strip-foot">
        {h ? (
          <span>
            <strong>{formatTime(h.t)}</strong> · {WORDS[h.state ?? 'none']}
            {h.detail ? ` · ${h.detail}` : ''}
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
