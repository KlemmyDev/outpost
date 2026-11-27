import { useEffect, useId, useState } from 'react'
import { getDelivery, saveDelivery, sendTestNotification } from '#/platform/notifications.functions'
import type { DeliveryConfig, NotificationLevel } from '#/platform/notifications.types'

export function NotificationsPanel() {
  const id = useId()
  const [form, setForm] = useState<DeliveryConfig | null>(null)
  const [saved, setSaved] = useState<DeliveryConfig | null>(null)
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getDelivery().then((r) => {
      setForm(r.config)
      setSaved(r.config)
      if (r.lastError) setMessage({ tone: 'bad', text: `The last notification couldn't be sent: ${r.lastError}` })
    })
  }, [])

  if (!form || !saved) {
    return (
      <section id="notifications" className="card">
        <h2>Notifications</h2>
        <span className="muted">Loading…</span>
      </section>
    )
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await saveDelivery({ data: form! })
      setForm(r.config)
      setSaved(r.config)
      setMessage({ tone: 'good', text: 'Saved.' })
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await sendTestNotification()
      setMessage(r.errors.length ? { tone: 'bad', text: r.errors.join('. ') } : { tone: 'good', text: 'Test sent. Check your phone.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="notifications" className="card" aria-labelledby={`${id}-title`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id={`${id}-title`}>Notifications</h2>
        <span className="muted" style={{ fontSize: 14 }}>
          Everything appears under the bell at the top. Send important ones to your phone too.
        </span>
      </div>
      <div className="form-grid">
        <label className="field" htmlFor={`${id}-ntfy`}>
          <span>ntfy topic address</span>
          <input
            id={`${id}-ntfy`}
            type="url"
            placeholder="https://ntfy.sh/your-private-topic"
            value={form.ntfyUrl}
            onChange={(e) => setForm({ ...form, ntfyUrl: e.target.value })}
          />
          <small>
            Install the free ntfy app and subscribe to the same topic. Pick a long, random topic name: anyone who knows it can read it.
            ntfy can also run on your own network.
          </small>
        </label>
        <label className="field" htmlFor={`${id}-hook`}>
          <span>Webhook address</span>
          <input
            id={`${id}-hook`}
            type="url"
            placeholder="https://example.com/hooks/outpost"
            value={form.webhookUrl}
            onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
          />
          <small>Gets a JSON POST: source, feature, level, title, body, at. For Home Assistant and similar.</small>
        </label>
        <label className="field" htmlFor={`${id}-level`}>
          <span>Send to phone and webhook</span>
          <select id={`${id}-level`} value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value as NotificationLevel })}>
            <option value="alert">Alerts only (the internet is down)</option>
            <option value="warn">Warnings and alerts</option>
            <option value="info">Everything, including "it's back"</option>
          </select>
        </label>
      </div>
      {message && <div className={`notice ${message.tone}`}>{message.text}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={save}>
          Save
        </button>
        <button type="button" className="btn secondary" disabled={busy || dirty || (!saved.ntfyUrl && !saved.webhookUrl)} onClick={test}>
          Send a test
        </button>
      </div>
    </section>
  )
}
