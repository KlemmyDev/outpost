import { useEffect, useState } from 'react'
import { listSerialPorts } from '../messages.functions'
import type { RadioSettings, Transport } from '../types'

const OPTIONS: { value: Transport; title: string; text: string }[] = [
  { value: 'serial', title: 'USB cable', text: 'The radio is plugged into the server. Most reliable.' },
  { value: 'tcp', title: 'Wi-Fi', text: 'A radio with the Wi-Fi companion firmware, on your network.' },
  { value: 'demo', title: 'Demo radio', text: 'Try Messages with pretend neighbours. Nothing is sent.' },
  { value: 'off', title: 'Off', text: "Don't connect to a radio." },
]

/** How Outpost reaches the radio: the choice of connection and its details. */
export function ConnectionFields({ value, onChange }: { value: RadioSettings; onChange: (s: RadioSettings) => void }) {
  const [ports, setPorts] = useState<{ path: string; label: string }[] | null>(null)
  useEffect(() => {
    if (value.transport === 'serial' && ports === null) listSerialPorts().then(setPorts).catch(() => setPorts([]))
  }, [value.transport, ports])

  return (
    <div className="conn-fields">
      <div className="conn-options" role="radiogroup" aria-label="Connection">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value.transport === o.value} className="conn-option" onClick={() => onChange({ ...value, transport: o.value })}>
            <strong>{o.title}</strong>
            <span className="muted">{o.text}</span>
          </button>
        ))}
      </div>

      {value.transport === 'serial' && (
        <div className="conn-detail">
          <label className="field">
            <span>Device</span>
            <input value={value.serialPath} onChange={(e) => onChange({ ...value, serialPath: e.target.value })} placeholder="/dev/meshcore" spellCheck={false} />
          </label>
          {ports && ports.length > 0 && (
            <div className="conn-ports">
              <span className="muted">Found:</span>
              {ports.map((p) => (
                <button key={p.path} type="button" className="tool-btn" onClick={() => onChange({ ...value, serialPath: p.path })}>
                  {p.path}
                </button>
              ))}
            </div>
          )}
          <p className="muted conn-help">
            In Docker, Outpost sees the radio as <code>/dev/meshcore</code>. On the server, set <code>MESHCORE_DEVICE=/dev/ttyACM0</code> (or wherever it appears) in
            Outpost's <code>.env</code> and run <code>bash install.sh</code> again. In a Proxmox container, pass the USB device through first:{' '}
            <code>bash proxmox-lxc.sh --usb &lt;id&gt;</code> on the Proxmox host.
          </p>
        </div>
      )}

      {value.transport === 'tcp' && (
        <div className="conn-detail conn-row">
          <label className="field grow">
            <span>Radio address</span>
            <input value={value.tcpHost} onChange={(e) => onChange({ ...value, tcpHost: e.target.value })} placeholder="192.168.1.60" spellCheck={false} inputMode="url" />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>Port</span>
            <input type="number" value={value.tcpPort} onChange={(e) => onChange({ ...value, tcpPort: Number(e.target.value) })} min={1} max={65535} />
          </label>
        </div>
      )}
    </div>
  )
}
