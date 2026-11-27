import { useState } from 'react'
import { disconnectPower, savePowerSettings } from '../power.functions'
import type { PowerData } from '../types'

const SCOPE_WORDS: Record<string, string> = {
  'live:read': 'live',
  'history:read': 'history',
  'costs:read': 'costs',
  'forecast:read': 'forecast',
  'insights:read': 'insights',
  'system:read': 'system',
}

/** Connecting to WattsMyPower: its address and an API key, and the alerts. */
export function PowerSettingsCard({ data, onChange, first = false }: { data: PowerData; onChange: (d: PowerData) => void; first?: boolean }) {
  const [url, setUrl] = useState(data.settings.url)
  const [key, setKey] = useState('')
  const [notifyGrid, setNotifyGrid] = useState(data.settings.notifyGrid)
  const [low, setLow] = useState(data.settings.lowBatteryPct)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [open, setOpen] = useState(first)
  const missing = ['live:read', 'history:read', 'forecast:read', 'system:read'].filter((s) => data.hasKey && data.scopes.length && !data.scopes.includes(s))

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const d = await savePowerSettings({ data: { url, ...(key.trim() ? { key } : {}), notifyGrid, lowBatteryPct: low } })
      onChange(d)
      setKey('')
      setMsg({ tone: 'good', text: d.state === 'ok' ? 'Connected to WattsMyPower.' : 'Saved.' })
    } catch (err) {
      setMsg({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form
      className="power-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className="field">
        <span>WattsMyPower's address</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.40:8080" spellCheck={false} inputMode="url" required />
      </label>
      <label className="field">
        <span>API key{data.hasKey ? ' (leave empty to keep the one saved)' : ''}</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={data.hasKey ? 'wmp_••••••••' : 'wmp_…'} spellCheck={false} autoComplete="off" type="password" required={!data.hasKey} />
      </label>
      <fieldset className="checks">
        <legend>Alerts</legend>
        <label>
          <input type="checkbox" checked={notifyGrid} onChange={(e) => setNotifyGrid(e.target.checked)} />
          When the grid goes down and comes back
        </label>
        <label>
          <input type="checkbox" checked={low > 0} onChange={(e) => setLow(e.target.checked ? 25 : 0)} />
          When the battery falls to
          <input type="number" min={5} max={90} value={low || 25} disabled={low === 0} onChange={(e) => setLow(Number(e.target.value))} style={{ width: 64, marginInline: 6 }} />% with no grid
        </label>
      </fieldset>
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
      {missing.length > 0 && <div className="notice warn">The key can't read {missing.map((s) => SCOPE_WORDS[s]).join(', ')}. Make a new key with those switched on for the full picture.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn accent" disabled={busy}>
          {busy ? 'Checking…' : data.hasKey ? 'Save' : 'Connect'}
        </button>
        {data.hasKey && (
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              onChange(await disconnectPower())
              setUrl('')
            }}
          >
            Disconnect
          </button>
        )}
      </div>
    </form>
  )

  if (first) {
    return (
      <section className="card power-setup">
        <span className="eyebrow">PWR · WATTSMYPOWER</span>
        <h1>Solar and battery, and how long it lasts</h1>
        <p className="lead">
          Outpost reads your inverter through WattsMyPower: what solar, the battery, the house and the grid are doing, and how long the battery would keep the house
          going if the grid went down.
        </p>
        <ol className="power-steps">
          <li>
            In WattsMyPower, open <strong>Settings › Developers</strong>.
          </li>
          <li>
            Name a key "Outpost", switch on <strong>live</strong>, <strong>history</strong>, <strong>forecast</strong>, <strong>system</strong> and (if you like){' '}
            <strong>costs</strong>, and make it.
          </li>
          <li>Copy the key (it's only shown once) and paste it here with WattsMyPower's address.</li>
        </ol>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          The key can only read. It's kept on this server and never shown again.
        </p>
        {form}
      </section>
    )
  }

  return (
    <section className="card" aria-labelledby="pwr-settings">
      <button type="button" className="power-settings-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2 id="pwr-settings">Connection and alerts</h2>
        <span className="muted">
          {data.settings.url} · {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && form}
    </section>
  )
}
