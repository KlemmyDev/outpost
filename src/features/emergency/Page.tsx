import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { CallBar } from '#/platform/ui/CallBar'
import { ago } from '#/features/library/format'
import { checkWarnings, saveEmergencySettings } from './emergency.functions'
import { EMERGENCY_NUMBERS } from './overview'
import { KitTab } from './ui/KitTab'
import { PlanTab } from './ui/PlanTab'
import { STATES, type EmergencyData, type StatusTile, type Warning, type WarningLevel } from './types'

export type EmergencyTab = 'now' | 'plan' | 'kit'

const LEVEL_CLASS: Record<WarningLevel, string> = { 'Emergency Warning': 'ew', 'Watch and Act': 'wa', Advice: 'adv', Weather: 'wx' }
const TILE_WORD = { good: 'OK', warn: 'Check', bad: 'Problem', off: 'Off' } as const

export function EmergencyPage({ initial, tab }: { initial: EmergencyData; tab: EmergencyTab }) {
  const [data, setData] = useState(initial)

  return (
    <main className="page em-page">
      <CallBar />
      <header className="aid-head">
        <span className="eyebrow">WATCHTOWER · EMERGENCY</span>
        <h1>Emergency</h1>
        <p className="lead">Warnings near home, how the house is holding up, your household's plan and your emergency kit.</p>
      </header>

      <div className="segmented em-tabs" role="tablist" aria-label="Emergency">
        {(
          [
            ['now', 'Now'],
            ['plan', 'Plan'],
            ['kit', 'Kit'],
          ] as const
        ).map(([id, label]) => (
          <Link key={id} to="/emergency" search={id === 'now' ? {} : { tab: id }} role="tab" aria-selected={tab === id} aria-pressed={tab === id} className="seg-link" replace>
            {label}
          </Link>
        ))}
      </div>

      {tab === 'now' && <NowTab data={data} onChange={setData} />}
      {tab === 'plan' && <PlanTab initial={data.plan} onSaved={(plan) => setData({ ...data, plan })} />}
      {tab === 'kit' && <KitTab initial={data.kit} onSaved={(kit) => setData({ ...data, kit })} />}
    </main>
  )
}

function NowTab({ data, onChange }: { data: EmergencyData; onChange: (d: EmergencyData) => void }) {
  const [busy, setBusy] = useState(false)
  const near = data.warnings.filter((w) => w.level !== 'Weather')
  const weather = data.warnings.filter((w) => w.level === 'Weather')

  async function check() {
    setBusy(true)
    try {
      onChange(await checkWarnings())
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="card" aria-labelledby="near-title">
        <div className="card-head">
          <h2 id="near-title">Warnings near home</h2>
          <button type="button" className="tool-btn" onClick={check} disabled={busy}>
            {busy ? 'Checking…' : 'Check now'}
          </button>
        </div>
        <p className="muted em-sub">
          {data.state ? `${data.state} · ` : ''}
          {data.home ? `within ${data.settings.radiusKm} km of ${data.home.name}` : 'statewide (set Home on the Map to see distances)'}
          {data.warningsAt ? ` · checked ${ago(data.warningsAt)}` : ''}
        </p>
        {data.warningsError && <div className="notice warn">{data.warningsError}</div>}
        {data.failed.length > 0 && !data.warningsError && <div className="notice warn">Couldn't reach {data.failed.join(' or ')} this time.</div>}
        {data.warningsAt &&
          (near.length === 0 ? (
            <div className="notice good">
              No fire or emergency warnings {data.home ? `within ${data.settings.radiusKm} km` : `in ${data.state}`}.
              {data.state && !['QLD', 'NSW', 'ACT', 'VIC'].includes(data.state) ? ' Fire warnings aren’t followed for this state yet; check your fire service.' : ''}
            </div>
          ) : (
            <ul className="em-warnings">
              {near.map((w) => (
                <WarningRow key={w.id} w={w} />
              ))}
            </ul>
          ))}
      </section>

      {weather.length > 0 && (
        <section className="card" aria-labelledby="wx-title">
          <div className="card-head">
            <h2 id="wx-title">Weather warnings for {data.state}</h2>
            <span className="mono">BUREAU OF METEOROLOGY</span>
          </div>
          <ul className="em-warnings">
            {weather.map((w) => (
              <WarningRow key={w.id} w={w} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="board-title" className="lib-section">
        <h2 id="board-title">How the house is holding up</h2>
        <div className="em-board">
          {data.board.map((t) => (
            <Tile key={t.id} t={t} />
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="nums-title">
        <h2 id="nums-title">Numbers</h2>
        <div className="rows">
          {[...EMERGENCY_NUMBERS, { number: '131 444', name: 'Police Assistance Line', note: 'Non-urgent police matters.' }].map((n) => (
            <a key={n.number} className="row lib-row-link" href={`tel:${n.number.replace(/\s/g, '')}`}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong>{n.name}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {n.note}
                </span>
              </span>
              <span className="big-number" style={{ fontSize: 22 }}>
                {n.number}
              </span>
            </a>
          ))}
        </div>
        <p className="muted em-sub">When phones and the internet are down, ABC Local Radio is the emergency broadcaster: keep a battery radio in the kit.</p>
      </section>

      <WarningSettings data={data} onChange={onChange} />
    </>
  )
}

function WarningRow({ w }: { w: Warning }) {
  return (
    <li className={`em-warning ${LEVEL_CLASS[w.level]}`}>
      <span className="em-level">{w.level === 'Weather' ? 'Weather' : w.level}</span>
      <span className="em-w-body">
        <strong>{w.title}</strong>
        <span className="muted">
          {[w.action, w.distanceKm !== null ? `${Math.round(w.distanceKm)} km away` : null, w.source, w.issued ? ago(w.issued) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      {w.url && (
        <a className="tool-btn" href={w.url} target="_blank" rel="noopener noreferrer">
          Details ↗
        </a>
      )}
    </li>
  )
}

function Tile({ t }: { t: StatusTile }) {
  const body = (
    <>
      <span className="em-tile-top">
        <span className="em-tile-label">{t.label}</span>
        <span className={`em-dot ${t.state}`} aria-label={TILE_WORD[t.state]} />
      </span>
      <strong>{t.value}</strong>
      <span className="muted">{t.detail}</span>
    </>
  )
  return t.href ? (
    <a className={`em-tile ${t.state}`} href={t.href}>
      {body}
    </a>
  ) : (
    <div className={`em-tile ${t.state}`}>{body}</div>
  )
}

function WarningSettings({ data, onChange }: { data: EmergencyData; onChange: (d: EmergencyData) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = data.settings
  async function save(patch: Partial<typeof s>) {
    setBusy(true)
    try {
      onChange(await saveEmergencySettings({ data: { ...s, ...patch } }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card" aria-labelledby="em-set">
      <button type="button" className="power-settings-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2 id="em-set">Warning settings</h2>
        <span className="muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="em-settings">
          <label className="field">
            <span>State</span>
            <select value={s.state ?? ''} disabled={busy} onChange={(e) => save({ state: (e.target.value || null) as typeof s.state })}>
              <option value="">{data.home && data.state ? `From Home on the Map (${data.state})` : 'From Home on the Map'}</option>
              {STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Distance from home</span>
            <select value={s.radiusKm} disabled={busy} onChange={(e) => save({ radiusKm: Number(e.target.value) })}>
              {[10, 25, 50, 100, 200].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
          <fieldset className="checks">
            <legend>Notify me about</legend>
            <label>
              <input type="checkbox" checked disabled /> Watch and Act and Emergency Warnings near home (always)
            </label>
            <label>
              <input type="checkbox" checked={s.notifyAdvice} disabled={busy} onChange={(e) => save({ notifyAdvice: e.target.checked })} /> Advice near home
            </label>
            <label>
              <input type="checkbox" checked={s.notifyWeather} disabled={busy} onChange={(e) => save({ notifyWeather: e.target.checked })} /> Severe weather, cyclone and serious flood warnings
            </label>
          </fieldset>
          <p className="muted em-sub">
            From the Bureau of Meteorology (every state), the Queensland Fire Department, NSW Rural Fire Service and VicEmergency. These are the feeds behind their own
            maps, checked every 10 minutes while there's internet. Always follow your local emergency services' advice.
          </p>
        </div>
      )}
    </section>
  )
}
