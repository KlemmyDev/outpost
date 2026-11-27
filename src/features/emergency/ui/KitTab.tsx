import { useRef, useState } from 'react'
import { saveKit } from '../emergency.functions'
import { expiringSoon } from '../kit'
import type { Kit, KitItem } from '../types'

/**
 * The emergency kit as a checklist: tick what's packed, and give a date to
 * anything that goes off or runs flat so Outpost can remind you. Saves as you go.
 */
export function KitTab({ initial, onSaved }: { initial: Kit; onSaved: (k: Kit) => void }) {
  const [items, setItems] = useState(initial.items)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function update(next: KitItem[]) {
    setItems(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        onSaved(await saveKit({ data: { items: next } }))
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    }, 500)
  }

  const have = items.filter((i) => i.have).length
  const soon = items.filter((i) => i.have && expiringSoon(i))

  return (
    <section className="card" aria-labelledby="kit-title">
      <div className="card-head">
        <h2 id="kit-title">Emergency kit</h2>
        <span className="big-number" style={{ fontSize: 26 }}>
          {have}/{items.length}
        </span>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div style={{ width: `${(have / Math.max(1, items.length)) * 100}%`, background: 'var(--eucalypt-ink)' }} />
      </div>
      <p className="muted em-sub">
        Packed in one place, ready to grab, and enough to stay put for three days without power. From Red Cross and Get Ready Queensland's lists. Saved as you tick.
      </p>
      {soon.length > 0 && <div className="notice warn">Expiring soon: {soon.map((i) => `${i.name} (${i.expires})`).join(', ')}.</div>}
      {error && <div className="notice bad">{error}</div>}
      <ul className="em-kit">
        {items.map((it) => (
          <li key={it.id} className={`${it.have ? 'have' : ''}${it.have && expiringSoon(it) ? ' soon' : ''}`}>
            <label className="em-kit-main">
              <input type="checkbox" checked={it.have} onChange={(e) => update(items.map((x) => (x.id === it.id ? { ...x, have: e.target.checked } : x)))} />
              <span>
                <strong>{it.name}</strong>
                {it.hint && <span className="muted">{it.hint}</span>}
              </span>
            </label>
            <label className="em-kit-date">
              <span className="visually-hidden">{it.name} expires</span>
              <input type="date" value={it.expires ?? ''} onChange={(e) => update(items.map((x) => (x.id === it.id ? { ...x, expires: e.target.value || null } : x)))} title="Expiry or replace-by date" />
            </label>
            {it.custom && (
              <button type="button" className="link-btn" onClick={() => update(items.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.name}`}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="em-kit-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          update([...items, { id: `k${Date.now().toString(36)}`, name: name.trim(), hint: '', have: false, expires: null, custom: true }])
          setName('')
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add something else: glasses, baby formula, the spare keys…" maxLength={80} aria-label="Add to the kit" />
        <button type="submit" className="tool-btn" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}
