import { Link } from '@tanstack/react-router'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'
import type { Health, InternetStatus } from './types'

export const HEALTH_WORDS: Record<Health, { value: string; caption: string; color: string }> = {
  online: { value: 'Online', caption: 'Working normally', color: 'var(--eucalypt)' },
  degraded: { value: 'Struggling', caption: 'Slow or dropping packets', color: 'var(--ochre)' },
  offline: { value: 'Down', caption: 'Everything in Outpost still works', color: 'var(--flare)' },
}

/** The last hour of latency as a small line. Gaps where probes failed. */
export function Sparkline({ values, color = 'var(--dusk)', label }: { values: (number | null)[]; color?: string; label: string }) {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return null
  const max = Math.max(...nums) * 1.15
  const min = Math.min(...nums) * 0.85
  const w = 240
  const h = 36
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * h
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `
    pen = true
  })
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function footer(s: InternetStatus): string {
  const parts: string[] = []
  if (s.uptime24hPct !== null) parts.push(`${s.uptime24hPct}% up today`)
  if (s.lastSpeedTest?.ok && s.lastSpeedTest.downMbps !== null) parts.push(`${Math.round(s.lastSpeedTest.downMbps)} Mbps down`)
  return parts.join(' · ') || 'Collecting the first readings'
}

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data.internet
    const latest = s?.latest
    if (!s || !latest) {
      return <SummaryCard label={feature.name} icon={feature.icon} tone="dusk" value="Checking…" caption="The first reading takes a few seconds." onOpen={onOpen} />
    }
    const w = HEALTH_WORDS[latest.health]
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone={latest.health === 'online' ? 'dusk' : latest.health === 'degraded' ? 'ochre' : 'flare'}
        value={w.value}
        caption={latest.latencyMs !== null ? `${Math.round(latest.latencyMs)} ms · ${latest.lossPct}% loss` : w.caption}
        visual={<Sparkline values={s.recentLatency} label="Latency over the last hour" />}
        footer={footer(s)}
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data.internet
    const latest = s?.latest
    if (!s || !latest) return <p className="muted">The first reading is on its way.</p>
    const w = HEALTH_WORDS[latest.health]
    return (
      <>
        <div>
          <div className="big-number">{w.value}</div>
          <div className="muted">{w.caption}</div>
        </div>
        {s.openEvent && s.openEvent.kind !== 'slow' && (
          <div className={`notice ${s.openEvent.kind === 'outage' ? 'bad' : 'warn'}`}>
            {s.openEvent.kind === 'outage' ? 'Down' : 'Struggling'} since{' '}
            {new Date(s.openEvent.startedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}. {s.openEvent.detail}
          </div>
        )}
        <div className="stat-grid">
          <div className="stat">
            <div className="k">Latency</div>
            <div className="v">{latest.latencyMs === null ? '—' : `${Math.round(latest.latencyMs)} ms`}</div>
          </div>
          <div className="stat">
            <div className="k">Packet loss</div>
            <div className="v">{latest.lossPct}%</div>
          </div>
          <div className="stat">
            <div className="k">Up today</div>
            <div className="v">{s.uptime24hPct === null ? '—' : `${s.uptime24hPct}%`}</div>
          </div>
          <div className="stat">
            <div className="k">Last speed test</div>
            <div className="v">{s.lastSpeedTest?.ok && s.lastSpeedTest.downMbps !== null ? `${Math.round(s.lastSpeedTest.downMbps)} Mbps` : '—'}</div>
          </div>
        </div>
        <div className="rows">
          {latest.checks.map((c) => (
            <div key={c.name} className="row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dot" style={{ background: c.ok ? 'var(--eucalypt)' : 'var(--flare)' }} aria-hidden="true" />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{c.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {c.detail}
                  </span>
                </span>
              </span>
              <span className="mono">{c.ms !== null ? `${Math.round(c.ms)} ms` : '—'}</span>
            </div>
          ))}
        </div>
        <Link to="/internet" search={{ range: '24h' }} className="btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Open the Internet dashboard
        </Link>
      </>
    )
  },
}
