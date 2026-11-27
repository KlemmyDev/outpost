import { useState } from 'react'
import { batteryPercent } from '../Page'
import { reconnectRadio, renameRadio, saveRadioSettings, shareHome } from '../messages.functions'
import type { RadioSettings, RadioStatus } from '../types'
import { ConnectionFields } from './ConnectionFields'

/** The radio's details, its name and position, how Outpost connects to it, and notifications. */
export function RadioSettingsPanel({ settings, status, onChange }: { settings: RadioSettings; status: RadioStatus; onChange: (s: RadioSettings, st: RadioStatus) => void }) {
  const [draft, setDraft] = useState(settings)
  const [name, setName] = useState(status.info?.name ?? '')
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const info = status.info
  const connected = status.state === 'connected'

  async function run(what: string, fn: () => Promise<void>, done: string) {
    setBusy(what)
    setMsg(null)
    try {
      await fn()
      setMsg({ tone: 'good', text: done })
    } catch (err) {
      setMsg({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(settings)

  return (
    <div className="radio-settings">
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}

      {info && (
        <section className="radio-facts" aria-label="This radio">
          <div>
            <span className="mono">FREQUENCY</span>
            <strong>{info.freq} MHz</strong>
          </div>
          <div>
            <span className="mono">BANDWIDTH · SF · CR</span>
            <strong>
              {info.bandwidth} kHz · {info.sf} · {info.cr}
            </strong>
          </div>
          <div>
            <span className="mono">POWER</span>
            <strong>{info.txPower} dBm</strong>
          </div>
          <div>
            <span className="mono">BATTERY</span>
            <strong>{info.batteryMv ? `${batteryPercent(info.batteryMv)}% · ${(info.batteryMv / 1000).toFixed(2)} V` : '—'}</strong>
          </div>
          <div className="wide">
            <span className="mono">ID</span>
            <code>{info.publicKey.slice(0, 16)}…</code>
          </div>
        </section>
      )}

      <form
        className="radio-row"
        onSubmit={(e) => {
          e.preventDefault()
          void run('name', async () => onChange(settings, await renameRadio({ data: { name } })), 'Renamed. Press Announce so others see the new name.')
        }}
      >
        <label className="field grow">
          <span>Name others see</span>
          <input value={name} maxLength={31} onChange={(e) => setName(e.target.value)} disabled={!connected} />
        </label>
        <button type="submit" className="tool-btn" disabled={!connected || busy !== null || !name.trim() || name === info?.name}>
          Rename
        </button>
      </form>

      <div className="radio-row">
        <span className="grow" style={{ fontSize: 14, lineHeight: 1.45 }}>
          <strong>Position in announcements</strong>
          <br />
          <span className="muted">{info?.lat !== null && info?.lat !== undefined ? `Sharing ${info.lat.toFixed(2)}, ${info.lon?.toFixed(2)} (to about 1 km).` : 'Not shared.'}</span>
        </span>
        <button
          type="button"
          className="tool-btn"
          disabled={!connected || busy !== null}
          onClick={() => run('pos', async () => onChange(settings, await shareHome({ data: { share: true } })), 'Sharing Home from the Map, rounded to about 1 km.')}
        >
          Share Home
        </button>
        {info?.lat !== null && info?.lat !== undefined && (
          <button type="button" className="tool-btn" disabled={busy !== null} onClick={() => run('pos', async () => onChange(settings, await shareHome({ data: { share: false } })), 'Stopped sharing a position.')}>
            Stop
          </button>
        )}
      </div>

      <h3 style={{ margin: '8px 0 0' }}>Connection</h3>
      <ConnectionFields value={draft} onChange={setDraft} />

      <fieldset className="checks">
        <legend>Notify me about</legend>
        <label>
          <input type="checkbox" checked={draft.notifyDirect} onChange={(e) => setDraft({ ...draft, notifyDirect: e.target.checked })} />
          Direct messages
        </label>
        <label>
          <input type="checkbox" checked={draft.notifyChannels} onChange={(e) => setDraft({ ...draft, notifyChannels: e.target.checked })} />
          Channel messages
        </label>
      </fieldset>

      <div className="radio-row">
        <button
          type="button"
          className="btn accent"
          disabled={!changed || busy !== null}
          onClick={() =>
            run(
              'save',
              async () => {
                const r = await saveRadioSettings({ data: draft })
                onChange(r.settings, r.status)
              },
              'Saved.',
            )
          }
        >
          Save
        </button>
        <button type="button" className="btn secondary" disabled={busy !== null || settings.transport === 'off'} onClick={() => run('re', async () => onChange(settings, await reconnectRadio()), 'Reconnecting.')}>
          Reconnect
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Frequency and modem settings are set when the radio is flashed, and every radio on a mesh has to match, so Outpost shows them but doesn't change them.
      </p>
    </div>
  )
}
