import type { ReactNode } from 'react'
import { Icon } from './Logo'

export type Tone = 'ochre' | 'dusk' | 'eucalypt' | 'ink' | 'flare'

const TONE: Record<Tone, { icon: string; label: string }> = {
  ochre: { icon: 'var(--ochre)', label: 'var(--ochre-ink)' },
  dusk: { icon: 'var(--dusk)', label: 'var(--dusk)' },
  eucalypt: { icon: 'var(--eucalypt)', label: 'var(--eucalypt-ink)' },
  ink: { icon: 'var(--ironbark)', label: 'var(--ironbark)' },
  flare: { icon: 'var(--flare)', label: 'var(--flare)' },
}

/**
 * The Overview's building block: a label, one clear answer, a small visual and
 * one line of context. The whole card is a button that opens the details.
 */
export function SummaryCard({
  label,
  icon,
  tone = 'ink',
  value,
  caption,
  footer,
  visual,
  onOpen,
  wide,
}: {
  label: string
  icon: string
  tone?: Tone
  value: ReactNode
  caption?: ReactNode
  footer?: ReactNode
  visual?: ReactNode
  onOpen?: () => void
  wide?: boolean
}) {
  const t = TONE[tone]
  const body = (
    <>
      <span className="summary-label" style={{ color: t.label }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={icon} size={18} color={t.icon} />
          {label}
        </span>
        {onOpen && (
          <span aria-hidden="true" className="chevron">
            ›
          </span>
        )}
      </span>
      <span className="summary-value">
        <span className="big-number">{value}</span>
        {caption && <span className="muted summary-caption">{caption}</span>}
      </span>
      {visual}
      {footer && <span className="muted summary-footer">{footer}</span>}
    </>
  )
  const className = `summary-card${wide ? ' wide' : ''}`
  return onOpen ? (
    <button type="button" className={className} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** A row of segments, used for battery and storage levels. */
export function Segments({ value, of = 10, color, label }: { value: number; of?: number; color: string; label: string }) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * of)
  return (
    <span role="img" aria-label={label} className="segments">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} style={{ background: i < filled ? color : 'var(--line-soft)' }} />
      ))}
    </span>
  )
}

export function Meter({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="muted">{detail}</span>
      </div>
      <div className="meter-track" role="img" aria-label={`${label} ${value}%`}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}
