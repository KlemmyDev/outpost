import { useState } from 'react'
import { saveRadioSettings } from '../messages.functions'
import { DEFAULT_RADIO, type RadioSettings, type RadioStatus } from '../types'
import { ConnectionFields } from './ConnectionFields'

/** First run: what MeshCore is, and how to connect a radio (or try the demo). */
export function SetupCard({ onSaved }: { onSaved: (s: RadioSettings, st: RadioStatus) => void }) {
  const [draft, setDraft] = useState<RadioSettings>({ ...DEFAULT_RADIO, transport: 'serial' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <section className="card msg-setup">
      <span className="eyebrow">COMMS · MESHCORE</span>
      <h1>Messages without the internet</h1>
      <p className="lead">
        A MeshCore radio sends short texts over LoRa, a few kilometres on its own and much further through repeaters, with no phone network or internet. Plug one into
        this server and everyone at home can send and read messages from here.
      </p>
      <ul className="msg-setup-list">
        <li>Any MeshCore device with the <strong>companion radio</strong> firmware works: Heltec, LilyGO T-Beam, RAK WisBlock, Seeed Xiao and more.</li>
        <li>
          In Australia, use the 915 MHz band and the <strong>Australia</strong> preset when flashing (915.8 MHz) so you hear the local mesh.
        </li>
        <li>Direct messages are encrypted between the two radios. The Public channel is readable by anyone on the mesh.</li>
      </ul>
      <ConnectionFields value={draft} onChange={setDraft} />
      {error && <div className="notice bad">{error}</div>}
      <button
        type="button"
        className="btn accent"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy || draft.transport === 'off'}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const r = await saveRadioSettings({ data: draft })
            onSaved(r.settings, r.status)
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Connecting…' : draft.transport === 'demo' ? 'Try the demo' : 'Connect'}
      </button>
    </section>
  )
}
