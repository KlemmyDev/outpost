import { useState } from 'react'
import { formatCoord, type CoordFormat } from '../geo'
import { KIND_STYLE, WAYPOINT_KINDS, type WaypointKind } from '../types'

export interface Draft {
  id?: number
  name: string
  kind: WaypointKind
  notes: string
  lat: number
  lon: number
}

/** Naming and placing a waypoint. The pin on the map can be dragged, or the map tapped, to move it. */
export function WaypointForm({ draft, onChange, onSave, onCancel, format }: { draft: Draft; onChange: (d: Draft) => void; onSave: (d: Draft) => Promise<void>; onCancel: () => void; format: CoordFormat }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="wp-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await onSave(draft)
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <span className="mono">{draft.id ? 'EDIT WAYPOINT' : 'NEW WAYPOINT'}</span>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={draft.name} maxLength={80} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Grandma's place" required />
      </label>
      <fieldset className="kind-picker">
        <legend>Kind</legend>
        {WAYPOINT_KINDS.map((k) => (
          <label key={k} className={draft.kind === k ? 'on' : ''}>
            <input type="radio" name="kind" value={k} checked={draft.kind === k} onChange={() => onChange({ ...draft, kind: k })} />
            <span className="kind-dot" style={{ background: KIND_STYLE[k].color, color: KIND_STYLE[k].ink }} aria-hidden="true">
              {KIND_STYLE[k].letter}
            </span>
            {KIND_STYLE[k].label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={draft.notes} maxLength={2000} onChange={(e) => onChange({ ...draft, notes: e.target.value })} placeholder="Gate code, water tank size, who to call…" />
      </label>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {formatCoord(draft.lat, draft.lon, format)}. Drag the pin or tap the map to move it.
      </p>
      {error && <div className="notice bad">{error}</div>}
      <div className="map-actions">
        <button type="submit" className="tool-btn accent" disabled={busy || !draft.name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="tool-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
