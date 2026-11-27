import { KIND_STYLE, type WaypointKind } from '../types'

/** A waypoint kind: its letter on its colour, with the word beside it unless compact. */
export function KindBadge({ kind, compact = false }: { kind: WaypointKind; compact?: boolean }) {
  const s = KIND_STYLE[kind]
  return (
    <span className="kind-badge" title={compact ? s.label : undefined}>
      <span className="kind-dot" style={{ background: s.color, color: s.ink }} aria-hidden="true">
        {s.letter}
      </span>
      {compact ? <span className="visually-hidden">{s.label}</span> : <span className="mono">{s.label.toUpperCase()}</span>}
    </span>
  )
}
