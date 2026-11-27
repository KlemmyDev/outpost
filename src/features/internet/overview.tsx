import { useState } from 'react'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'
import { recheckInternet } from './internet.functions'
import type { InternetStatus } from './types'

const WORDS: Record<InternetStatus['state'], { value: string; caption: string }> = {
  online: { value: 'Online', caption: 'Working normally' },
  degraded: { value: 'Patchy', caption: 'Some things answered, some didn’t' },
  offline: { value: 'Down', caption: 'Everything in Outpost still works' },
}

function Dots({ status }: { status: InternetStatus }) {
  return (
    <span style={{ display: 'flex', gap: 6 }} aria-hidden="true">
      {status.checks.map((c) => (
        <span key={c.name} className="dot" style={{ width: 10, height: 10, background: c.ok ? 'var(--eucalypt)' : 'var(--flare)' }} />
      ))}
    </span>
  )
}

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const status = data.internet
    if (!status) {
      return <SummaryCard label={feature.name} icon={feature.icon} tone="dusk" value="Unknown" caption="The check didn’t finish." onOpen={onOpen} />
    }
    const w = WORDS[status.state]
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone="dusk"
        value={w.value}
        caption={status.latencyMs !== null ? `Answering in ${status.latencyMs} ms` : w.caption}
        visual={<Dots status={status} />}
        footer={`${status.checks.filter((c) => c.ok).length} of ${status.checks.length} checks passed`}
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const [status, setStatus] = useState(data.internet ?? null)
    const [busy, setBusy] = useState(false)
    async function again() {
      setBusy(true)
      try {
        setStatus(await recheckInternet())
      } finally {
        setBusy(false)
      }
    }
    if (!status) return <p className="muted">The check didn’t finish. Try again in a minute.</p>
    return (
      <>
        <div>
          <div className="big-number">{WORDS[status.state].value}</div>
          <div className="muted">{WORDS[status.state].caption}</div>
        </div>
        <div className="rows">
          {status.checks.map((c) => (
            <div key={c.name} className="row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dot" style={{ background: c.ok ? 'var(--eucalypt)' : 'var(--flare)' }} aria-hidden="true" />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{c.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {c.ok ? c.detail : `Failed: ${c.detail}`}
                  </span>
                </span>
              </span>
              <span className="mono">{c.ms !== null ? `${c.ms} ms` : '—'}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Checked at {new Date(status.checkedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}. Speed tests and an
          outage history are coming in a later version.
        </p>
        <button type="button" className="btn secondary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={again}>
          {busy ? 'Checking…' : 'Check again'}
        </button>
      </>
    )
  },
}
