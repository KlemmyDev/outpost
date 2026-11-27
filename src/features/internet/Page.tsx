import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { niceMax, TimeChart } from '#/platform/ui/charts/TimeChart'
import { StatusStrip } from '#/platform/ui/charts/StatusStrip'
import { lastedLabel } from './format'
import { runProbe, runSpeedTest } from './internet.functions'
import { HEALTH_WORDS } from './overview'
import { SettingsForm } from './SettingsForm'
import { RANGES, type InternetSettings, type InternetStats, type InternetStatus, type NetEvent, type Range } from './types'

export interface DashboardData {
  status: InternetStatus
  stats: InternetStats
  settings: InternetSettings
  monthlyGB: number
}

const RANGE_LABEL: Record<Range, string> = { '1h': 'Hour', '24h': 'Day', '7d': 'Week', '30d': 'Month' }

function timeFormatter(range: Range) {
  return (t: number) => {
    const d = new Date(t)
    if (range === '1h' || range === '24h') return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    if (range === '7d') return d.toLocaleString('en-AU', { weekday: 'short', hour: 'numeric' })
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }
}

const shortTime = (t: number) => new Date(t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const EVENT_WORDS: Record<NetEvent['kind'], { name: string; tone: string }> = {
  outage: { name: 'Down', tone: 'var(--flare)' },
  degraded: { name: 'Struggling', tone: 'var(--ochre)' },
  slow: { name: 'Slow speed test', tone: 'var(--ochre)' },
}

export function InternetDashboard({ data, range }: { data: DashboardData; range: Range }) {
  const router = useRouter()
  const { status, stats, settings } = data
  const latest = status.latest
  const [busy, setBusy] = useState<'probe' | 'speed' | null>(status.speedTestRunning ? 'speed' : null)
  const [error, setError] = useState<string | null>(null)
  // The event being hovered or focused in the list, shaded on every chart.
  const [focusEvent, setFocusEvent] = useState<NetEvent | null>(null)
  const highlight = focusEvent
    ? { from: focusEvent.startedAt, to: focusEvent.endedAt ?? Date.now(), label: EVENT_WORDS[focusEvent.kind].name }
    : null
  const fmt = timeFormatter(range)

  // Refresh as often as new readings arrive, but no more than every 30 s.
  useEffect(() => {
    const every = Math.max(30, settings.probeIntervalSec) * 1000
    const t = setInterval(() => void router.invalidate(), every)
    return () => clearInterval(t)
  }, [router, settings.probeIntervalSec])

  async function act(kind: 'probe' | 'speed') {
    setBusy(kind)
    setError(null)
    try {
      const result = kind === 'probe' ? await runProbe() : await runSpeedTest()
      if (kind === 'speed' && 'ok' in result && !result.ok) setError(result.error ?? 'The speed test failed.')
      await router.invalidate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const times = stats.buckets.map((b) => b.t)
  const lossMax = niceMax(Math.max(settings.lossWarnPct * 2, ...stats.buckets.map((b) => b.lossAvg ?? 0)))
  const speedTimes = stats.speedTests.filter((s) => s.ok).map((s) => s.at)
  const speedOk = stats.speedTests.filter((s) => s.ok)
  const health = latest ? HEALTH_WORDS[latest.health] : null

  return (
    <main className="page">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">NET · checked every {settings.probeIntervalSec < 60 ? `${settings.probeIntervalSec} s` : `${settings.probeIntervalSec / 60} min`}</span>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="dot" style={{ width: 16, height: 16, background: health?.color ?? 'var(--muted-dot)' }} aria-hidden="true" />
            {health ? `Internet ${health.value.toLowerCase()}` : 'Internet'}
          </h1>
          <p className="lead">
            {status.openEvent && status.openEvent.kind !== 'slow'
              ? `${EVENT_WORDS[status.openEvent.kind].name} since ${shortTime(status.openEvent.startedAt)}. ${status.openEvent.detail}`
              : stats.uptimePct !== null
                ? `Up ${stats.uptimePct}% of the last ${RANGE_LABEL[range].toLowerCase()}.`
                : 'Collecting the first readings.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => act('probe')}>
            {busy === 'probe' ? 'Checking…' : 'Check now'}
          </button>
          <button type="button" className="btn accent" disabled={busy !== null} onClick={() => act('speed')}>
            {busy === 'speed' ? 'Testing speed…' : 'Run speed test'}
          </button>
        </div>
      </div>
      {error && <div className="notice bad">{error}</div>}

      <section className="tile-grid" aria-label="Right now">
        <Tile label="Latency" value={latest?.latencyMs != null ? `${Math.round(latest.latencyMs)}` : '—'} unit="ms" note={stats.latencyMedian !== null ? `Usually ${Math.round(stats.latencyMedian)} ms` : undefined} />
        <Tile label="Jitter" value={latest?.jitterMs != null ? `${Math.round(latest.jitterMs)}` : '—'} unit="ms" note="Variation between replies" />
        <Tile label="Packet loss" value={latest ? `${latest.lossPct}` : '—'} unit="%" note={stats.lossAvg !== null ? `Average ${stats.lossAvg}%` : undefined} />
        <Tile
          label="Speed"
          value={status.lastSpeedTest?.ok && status.lastSpeedTest.downMbps !== null ? `${Math.round(status.lastSpeedTest.downMbps)}` : '—'}
          unit="Mbps down"
          note={
            status.lastSpeedTest?.ok && status.lastSpeedTest.upMbps !== null
              ? `${Math.round(status.lastSpeedTest.upMbps)} up · ${shortTime(status.lastSpeedTest.at)}`
              : status.nextSpeedTestAt
                ? `First test ${shortTime(status.nextSpeedTestAt)}`
                : 'Speed tests are off'
          }
        />
      </section>

      <div className="segmented" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <Link key={r} to="/internet" search={{ range: r }} aria-pressed={r === range} className="seg-link" replace>
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </div>

      <section className="card" aria-labelledby="uptime-title">
        <div className="card-head">
          <h2 id="uptime-title">Uptime</h2>
          <span className="big-number" style={{ fontSize: 28 }}>
            {stats.uptimePct === null ? '—' : `${stats.uptimePct}%`}
          </span>
        </div>
        <StatusStrip
          highlight={highlight}
          label={`Internet health over the last ${RANGE_LABEL[range].toLowerCase()}`}
          formatTime={fmt}
          items={stats.buckets.map((b) => ({
            t: b.t,
            state: b.state,
            detail: b.count ? `${b.latencyAvg ?? '—'} ms average, ${b.lossAvg}% loss` : undefined,
          }))}
        />
      </section>

      <section className="card" aria-labelledby="latency-title">
        <div className="card-head">
          <h2 id="latency-title">Latency</h2>
          <span className="mono">
            {stats.latencyMedian !== null ? `MEDIAN ${Math.round(stats.latencyMedian)} MS` : ''}
            {stats.latencyP95 !== null ? ` · 95% UNDER ${Math.round(stats.latencyP95)} MS` : ''}
          </span>
        </div>
        <TimeChart
          label={`Latency and jitter over the last ${RANGE_LABEL[range].toLowerCase()}`}
          times={times}
          unit="ms"
          formatTime={fmt}
          highlight={highlight}
          threshold={{ value: settings.latencyWarnMs, label: `Struggling above ${settings.latencyWarnMs} ms` }}
          series={[
            { key: 'lat', label: 'Latency', color: 'var(--dusk)', values: stats.buckets.map((b) => b.latencyAvg) },
            { key: 'jit', label: 'Jitter', color: 'var(--ochre)', values: stats.buckets.map((b) => b.jitterAvg) },
          ]}
        />
      </section>

      <section className="card" aria-labelledby="loss-title">
        <div className="card-head">
          <h2 id="loss-title">Packet loss</h2>
          <span className="mono">{stats.lossAvg !== null ? `AVERAGE ${stats.lossAvg}%` : ''}</span>
        </div>
        <TimeChart
          label={`Packet loss over the last ${RANGE_LABEL[range].toLowerCase()}`}
          times={times}
          unit="%"
          height={110}
          decimals={1}
          yMax={lossMax}
          formatTime={fmt}
          highlight={highlight}
          threshold={{ value: settings.lossWarnPct, label: `Struggling at ${settings.lossWarnPct}%` }}
          series={[{ key: 'loss', label: 'Packet loss', color: 'var(--ochre)', kind: 'bar', values: stats.buckets.map((b) => b.lossAvg) }]}
        />
      </section>

      <section className="card" aria-labelledby="speed-title">
        <div className="card-head">
          <h2 id="speed-title">Speed tests</h2>
          <span className="mono">{stats.usualDownMbps !== null ? `USUAL ${Math.round(stats.usualDownMbps)} MBPS DOWN` : ''}</span>
        </div>
        {speedOk.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {settings.speedTestEveryHours === 0
              ? 'Scheduled speed tests are off. Run one any time with the button above.'
              : `No speed tests yet. The first runs ${status.nextSpeedTestAt ? shortTime(status.nextSpeedTestAt) : 'soon'}.`}
          </p>
        ) : (
          <TimeChart
            label="Download and upload speed per test"
            times={speedTimes}
            unit="Mbps"
            markers
            formatTime={shortTime}
            threshold={stats.usualDownMbps !== null ? { value: stats.usualDownMbps, label: `Usual ${Math.round(stats.usualDownMbps)} Mbps` } : undefined}
            series={[
              { key: 'down', label: 'Download', color: 'var(--dusk)', values: speedOk.map((s) => s.downMbps) },
              { key: 'up', label: 'Upload', color: 'var(--ochre)', values: speedOk.map((s) => s.upMbps) },
            ]}
          />
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          One connection to Cloudflare each way. Very fast plans can read a little low.
        </p>
      </section>

      <section className="card" aria-labelledby="events-title">
        <div className="card-head">
          <h2 id="events-title">Events</h2>
          <span className="mono">{stats.events.length} IN THIS RANGE · HOVER ONE TO SEE IT ON THE CHARTS</span>
        </div>
        {stats.events.length === 0 ? (
          <div className="notice good">No outages or slow periods in the last {RANGE_LABEL[range].toLowerCase()}.</div>
        ) : (
          <div className="rows">
            {stats.events.map((e) => (
              <div
                key={e.id}
                className={`row event-row${focusEvent?.id === e.id ? ' active' : ''}`}
                tabIndex={0}
                aria-label={`${EVENT_WORDS[e.kind].name}, ${shortTime(e.startedAt)}, ${lastedLabel(e)}. Shows this time on the charts.`}
                onPointerEnter={() => setFocusEvent(e)}
                onPointerLeave={() => setFocusEvent(null)}
                onFocus={() => setFocusEvent(e)}
                onBlur={() => setFocusEvent(null)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="dot" style={{ background: EVENT_WORDS[e.kind].tone }} aria-hidden="true" />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong>{EVENT_WORDS[e.kind].name}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {e.detail}
                    </span>
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 13 }}>
                  <span>{shortTime(e.startedAt)}</span>
                  <span className="muted">{lastedLabel(e)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <SettingsForm initial={settings} monthlyGB={data.monthlyGB} />
    </main>
  )
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  return (
    <div className="summary-card">
      <span className="summary-label">{label}</span>
      <span className="summary-value">
        <span className="big-number">
          {value} <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--stone)' }}>{unit}</span>
        </span>
        {note && <span className="muted summary-caption">{note}</span>}
      </span>
    </div>
  )
}
