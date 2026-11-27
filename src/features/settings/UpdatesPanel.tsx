import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '#/platform/ui/api'
import { CHANNELS, type Channel } from '#/platform/updates/channels'
import type { UpdateStatus } from '#/platform/updates/types'

const CHANNEL_HELP: Record<Channel, string> = {
  stable: 'Tested releases only. Best for most homes.',
  beta: 'New features a little earlier, after a first round of testing.',
  nightly: 'Every change as soon as it lands. Can break.',
}

const ACTIVE = new Set(['requested', 'running'])

function when(seconds: number | null): string {
  if (!seconds) return 'never'
  const mins = Math.round((Date.now() / 1000 - seconds) / 60)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 48 ? `${hours} h ago` : new Date(seconds * 1000).toLocaleDateString('en-AU')
}

function label(v: { version: string; release: string | null }): string {
  return v.release ? `${v.version} (${v.release})` : v.version
}

export function UpdatesPanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloading, setReloading] = useState<string | null>(null)
  const startCommit = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await api<UpdateStatus>('GET', '/api/updates')
      setStatus(next)
      setError(null)
      startCommit.current ??= next.current.commit
      // The server restarted on a different commit: the update finished.
      if (startCommit.current && next.current.commit && next.current.commit !== startCommit.current) {
        setReloading(label(next.current))
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (err) {
      // While an update restarts the container the API is briefly gone.
      setError((err as Error).message)
    }
  }, [])

  const installing = status ? ACTIVE.has(status.install.state) : false
  useEffect(() => {
    void load()
    const every = installing || error ? 3000 : 5 * 60 * 1000
    const timer = setInterval(load, every)
    return () => clearInterval(timer)
  }, [load, installing, error])

  async function run(action: () => Promise<UpdateStatus>) {
    setBusy(true)
    try {
      setStatus(await action())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <section id="updates" className="card">
        <h2>Updates</h2>
        <span className="muted">{error ?? 'Loading…'}</span>
      </section>
    )
  }

  const { install, latest } = status
  return (
    <section id="updates" className="card" aria-labelledby="updates-title">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <h2 id="updates-title">Updates</h2>
        <span className="mono">
          {status.repo} · checked {when(status.checkedAt)}
        </span>
      </div>

      {reloading && <div className="notice good">Now on {reloading}. Reloading…</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Running
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {label(status.current)}
          </span>
          <span className="mono">{status.current.commit ? status.current.commit.slice(0, 7) : 'local build'}</span>
        </div>
        {latest && status.move && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {status.move === 'update' ? 'Available' : `On the ${status.channel} channel`}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ochre-ink)' }}>
              {label(latest)}
            </span>
            <span className="mono">
              {latest.tag ?? latest.commit.slice(0, 7)}
              {latest.changes ? ` · ${latest.changes} change${latest.changes === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        )}
      </div>

      {!status.move && latest && !error && <div className="notice good">Outpost is up to date.</div>}
      {status.move === 'older' && (
        <div className="notice warn">
          The {status.channel} channel is behind the version you're running. Installing goes back to {label(latest!)}.
        </div>
      )}
      {status.error && <div className="notice warn">{status.error}</div>}
      {error && !reloading && (
        <div className="notice warn">{installing ? 'Outpost is restarting with the new version…' : error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span id="channel-label" style={{ fontSize: 13, fontWeight: 600 }}>
          Channel
        </span>
        <div className="segmented" role="group" aria-labelledby="channel-label">
          {CHANNELS.slice()
            .reverse()
            .map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={status.channel === c}
                disabled={busy || installing}
                onClick={() => run(() => api('PUT', '/api/updates/channel', { channel: c }))}
              >
                {c[0]!.toUpperCase() + c.slice(1)}
              </button>
            ))}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {CHANNEL_HELP[status.channel]}
        </span>
      </div>

      <InstallState status={status} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {status.move && (
          <button
            type="button"
            className="btn accent"
            disabled={busy || installing || !install.ready}
            onClick={() => run(() => api('POST', '/api/updates/install'))}
          >
            {status.move === 'update' ? `Install ${label(latest!)}` : `Go back to ${label(latest!)}`}
          </button>
        )}
        <button type="button" className="btn secondary" disabled={busy || installing} onClick={() => run(() => api('POST', '/api/updates/check'))}>
          Check now
        </button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={status.autoCheck}
            disabled={busy}
            onChange={(e) => run(() => api('PUT', '/api/updates', { autoCheck: e.target.checked }))}
          />
          Check GitHub every 6 hours
        </label>
      </div>
    </section>
  )
}

function InstallState({ status }: { status: UpdateStatus }) {
  const { install } = status
  if (!install.ready && install.state === 'idle') {
    return (
      <div className="notice warn">
        {install.why} Updates can still be installed from the host with <code>bash install.sh --yes</code>.
      </div>
    )
  }
  switch (install.state) {
    case 'requested':
      return <div className="notice good">Update requested. The host updater picks it up within a minute.</div>
    case 'running':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="notice good">Updating: backing up, building and restarting. This page reloads when it's done.</div>
          {install.log.length > 0 && <pre className="log">{install.log.join('\n')}</pre>}
        </div>
      )
    case 'done':
      return <div className="notice good">Updated successfully.</div>
    case 'failed':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="notice bad">
            The update didn't finish{install.error ? `: ${install.error}` : '.'} The previous version is still running, or can
            be restored on the host with <code>bash install.sh --rollback</code>.
          </div>
          {install.log.length > 0 && <pre className="log">{install.log.join('\n')}</pre>}
        </div>
      )
    case 'expired':
      return <div className="notice warn">The update request timed out before the updater saw it. Try again.</div>
    default:
      return null
  }
}
