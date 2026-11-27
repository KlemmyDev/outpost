import { useEffect, useState } from 'react'
import { TimeChart } from '#/platform/ui/charts/TimeChart'
import { ago } from '#/features/library/format'
import { getPowerHistory, refreshPower } from './power.functions'
import { hoursLabel, kw } from './runtime'
import { PowerSettingsCard } from './ui/PowerSettingsCard'
import type { HistorySeries, PowerData, Runtime } from './types'

const SOLAR = '#C2652A'
const HOME = '#2F6FAE'

const clock = (t: number) => new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const dayClock = (t: number) => new Date(t).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const dayName = (date: string) => {
  const d = new Date(`${date}T12:00:00`)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Rest of today'
  if (d.toDateString() === new Date(Date.now() + 86_400_000).toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-AU', { weekday: 'long' })
}
const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`

/** Weather codes (WMO) to a word, for the forecast days. */
function sky(code: number | null): string {
  if (code === null) return ''
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Mostly sunny'
  if (code === 3) return 'Cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  return 'Storms'
}

export function PowerPage({ initial }: { initial: PowerData }) {
  const [data, setData] = useState(initial)
  const [range, setRange] = useState<'24h' | '7d'>('24h')
  const [history, setHistory] = useState<HistorySeries | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const connected = data.state === 'ok' || data.state === 'stale'

  useEffect(() => {
    if (!data.hasKey || !data.settings.url) return
    const t = setInterval(() => void refreshPower().then(setData).catch(() => {}), 30_000)
    return () => clearInterval(t)
  }, [data.hasKey, data.settings.url])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    setHistoryError(null)
    getPowerHistory({ data: { range } })
      .then((h) => !cancelled && setHistory(h))
      .catch((err: Error) => !cancelled && setHistoryError(err.message))
    return () => {
      cancelled = true
    }
  }, [range, connected])

  if (!data.hasKey || !data.settings.url) {
    return (
      <main className="page">
        <PowerSettingsCard data={data} onChange={setData} first />
      </main>
    )
  }

  const { now, system, runtime, forecast, costs } = data
  const off = now?.offGrid ?? false
  const title = !now ? 'Power' : off ? 'Running on the battery' : now.solarW > now.homeW ? 'Running on the sun' : 'On the grid'

  return (
    <main className="page power-page">
      <div className="power-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">PWR · WATTSMYPOWER{system ? ` · ${system.model.toUpperCase()}` : ''}</span>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="dot" style={{ width: 16, height: 16, background: !connected ? 'var(--muted-dot)' : off ? 'var(--flare)' : 'var(--eucalypt)' }} aria-hidden="true" />
            {title}
          </h1>
          <p className="lead">
            {!now
              ? 'Waiting for the first reading.'
              : off
                ? `The grid has been down${now.offGridSince ? ` since ${clock(now.offGridSince)}` : ''}. ${runtimeSentence(runtime)}`
                : `Solar ${kw(now.solarW)}, home ${kw(now.homeW)}. ${runtimeSentence(runtime, true)}`}
          </p>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {now ? `Reading ${ago(now.at)}` : ''}
        </span>
      </div>

      {data.state === 'error' && <div className="notice warn">{data.error} {data.lastOkAt ? `Last reading ${ago(data.lastOkAt)}.` : ''}</div>}
      {data.state === 'stale' && now && <div className="notice warn">WattsMyPower's last reading is from {ago(now.at)}: the inverter may not be answering it.</div>}

      {now && system && (
        <section className={`card runtime-card${off ? ' off' : ''}`} aria-labelledby="runtime-title">
          <div className="runtime-main">
            <span className="mono" id="runtime-title">
              {off ? 'BATTERY LEFT' : 'IF THE GRID WENT DOWN NOW'}
            </span>
            <span className="runtime-big">{runtime ? runtimeHeadline(runtime) : '—'}</span>
            <span className="muted">{runtime ? runtimeDetail(runtime) : 'Needs the battery size from WattsMyPower.'}</span>
          </div>
          <BatteryGauge pct={now.batteryPct} reserve={system.reservePct} kwh={system.batteryKwh} watts={now.batteryW} />
          {runtime && (
            <dl className="runtime-facts">
              <div>
                <dt>At this rate</dt>
                <dd>{runtime.atThisRateH === null ? 'Solar covers the house' : hoursLabel(runtime.atThisRateH)}</dd>
              </div>
              <div>
                <dt>Through a usual night</dt>
                <dd>{runtime.usualNightH === null ? '—' : hoursLabel(runtime.usualNightH)}</dd>
              </div>
              <div>
                <dt>Usable above the {system.reservePct}% reserve</dt>
                <dd>{runtime.usableKwh} kWh</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {now && (
        <section className="tile-grid power-tiles" aria-label="Right now">
          <Flow label="Solar" value={kw(now.solarW)} note={`${now.today.solarKwh.toFixed(1)} kWh today${system?.pvKw ? ` · ${Math.round((now.solarW / 1000 / system.pvKw) * 100)}% of the array` : ''}`} color={SOLAR} />
          <Flow label="Home" value={kw(now.homeW)} note={costs ? `${costs.homeKwh.toFixed(1)} kWh today` : 'Using now'} color={HOME} />
          <Flow
            label="Battery"
            value={Math.abs(now.batteryW) < 30 ? 'Idle' : kw(now.batteryW)}
            note={`${Math.abs(now.batteryW) < 30 ? 'Holding' : now.batteryW < 0 ? 'Charging' : 'Discharging'}${now.batteryTempC !== null ? ` · ${Math.round(now.batteryTempC)}°C` : ''}`}
            color="var(--eucalypt-ink)"
          />
          <Flow
            label="Grid"
            value={off ? 'Down' : Math.abs(now.gridW) < 30 ? 'Idle' : kw(now.gridW)}
            note={off ? 'No power from the grid' : `${Math.abs(now.gridW) < 30 ? 'Not used' : now.gridW > 0 ? 'Importing' : 'Exporting'}${now.gridVoltage ? ` · ${Math.round(now.gridVoltage)} V` : ''}`}
            color={off ? 'var(--flare)' : 'var(--stone)'}
          />
        </section>
      )}

      {costs && (
        <section className="card power-costs" aria-label="Today's cost">
          <div>
            <span className="mono">TODAY SO FAR</span>
            <strong>{money(costs.netCost)}</strong>
            <span className="muted">after feed-in</span>
          </div>
          <div>
            <span className="mono">SOLAR AND BATTERY SAVED</span>
            <strong>{money(costs.saved)}</strong>
            <span className="muted">at your rates</span>
          </div>
          <div>
            <span className="mono">GRID TODAY</span>
            <strong>
              {now ? `${now.today.importKwh.toFixed(1)} in · ${now.today.exportKwh.toFixed(1)} out` : '—'}
            </strong>
            <span className="muted">kWh</span>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="hist-title">
        <div className="card-head">
          <h2 id="hist-title">{range === '24h' ? 'Last 24 hours' : 'Last 7 days'}</h2>
          <div className="segmented" role="group" aria-label="Range">
            <button type="button" aria-pressed={range === '24h'} onClick={() => setRange('24h')}>
              Day
            </button>
            <button type="button" aria-pressed={range === '7d'} onClick={() => setRange('7d')}>
              Week
            </button>
          </div>
        </div>
        {historyError ? (
          <div className="notice warn">{historyError}</div>
        ) : !history ? (
          <p className="muted">Loading…</p>
        ) : history.t.length === 0 ? (
          <p className="muted">No readings in this range.</p>
        ) : (
          <>
            <TimeChart
              label={`Solar and home power over the ${range === '24h' ? 'last day' : 'last week'}`}
              times={history.t}
              unit="kW"
              decimals={1}
              formatTime={range === '24h' ? clock : dayClock}
              series={[
                { key: 'solar', label: 'Solar', color: SOLAR, values: history.solarW.map((v) => (v === null ? null : v / 1000)) },
                { key: 'home', label: 'Home', color: HOME, values: history.homeW.map((v) => (v === null ? null : v / 1000)) },
              ]}
            />
            <TimeChart
              label="Battery level"
              times={history.t}
              unit="%"
              height={110}
              yMax={100}
              formatTime={range === '24h' ? clock : dayClock}
              threshold={system ? { value: system.reservePct, label: `Reserve ${system.reservePct}%` } : undefined}
              series={[{ key: 'soc', label: 'Battery', color: 'var(--eucalypt-ink)', values: history.batteryPct }]}
            />
          </>
        )}
      </section>

      {forecast && forecast.hours.length > 0 && (
        <section className="card" aria-labelledby="fc-title">
          <div className="card-head">
            <h2 id="fc-title">The next two days</h2>
            <span className="mono">{forecast.fullAt ? `FULL BY ${dayClock(forecast.fullAt).toUpperCase()}` : 'FROM WATTSMYPOWER’S FORECAST'}</span>
          </div>
          <div className="fc-days">
            {forecast.days.slice(0, 3).map((d) => (
              <div key={d.date} className="fc-day">
                <span className="mono">{dayName(d.date).toUpperCase()}</span>
                <strong>{d.solarKwh.toFixed(0)} kWh solar</strong>
                <span className="muted">
                  {sky(d.code)}
                  {d.tempMax !== null ? ` · ${Math.round(d.tempMax)}°` : ''} · uses {d.homeKwh.toFixed(0)} kWh
                </span>
                {d.minSoc !== null && <span className="muted">Battery {Math.round(d.minSoc)}–{Math.round(d.maxSoc ?? d.minSoc)}%</span>}
              </div>
            ))}
          </div>
          <TimeChart
            label="Forecast solar and home use, hour by hour"
            times={forecast.hours.map((h) => h.t)}
            unit="kW"
            decimals={1}
            formatTime={dayClock}
            series={[
              { key: 'solar', label: 'Solar', color: SOLAR, values: forecast.hours.map((h) => h.solarKw) },
              { key: 'home', label: 'Home', color: HOME, values: forecast.hours.map((h) => h.homeKw) },
            ]}
          />
        </section>
      )}

      <PowerSettingsCard data={data} onChange={setData} />
    </main>
  )
}

function runtimeHeadline(r: Runtime): string {
  if (r.forecastEnd) {
    const h = (r.forecastEnd - Date.now()) / 3_600_000
    return h >= 48 ? `${Math.floor(h / 24)}+ days` : `${hoursLabel(h)}+`
  }
  if (r.withForecastUntil) return `Until ${dayClock(r.withForecastUntil)}`
  if (r.atThisRateH !== null) return hoursLabel(r.atThisRateH)
  if (r.usualNightH !== null) return hoursLabel(r.usualNightH)
  return '—'
}

function runtimeDetail(r: Runtime): string {
  if (r.forecastEnd) return `With the forecast solar, it wouldn't fall below ${r.forecastLowPct}% through to ${dayClock(r.forecastEnd)}, where the forecast ends.`
  if (r.withForecastUntil) return `Following the forecast's solar and home use hour by hour, then down to the reserve.`
  return 'Without a forecast, at the home’s draw right now.'
}

function runtimeSentence(r: Runtime | null, ifDown = false): string {
  if (!r) return ''
  const lead = ifDown ? 'If the grid went down, the battery would last' : 'The battery should last'
  if (r.forecastEnd) return `${lead} the next two days with the forecast solar.`
  if (r.withForecastUntil) return `${lead} until ${dayClock(r.withForecastUntil)}.`
  if (r.atThisRateH !== null) return `${lead} about ${hoursLabel(r.atThisRateH)} at this rate.`
  return ''
}

function Flow({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="summary-card">
      <span className="summary-label" style={{ color }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" style={{ background: color }} aria-hidden="true" />
          {label}
        </span>
      </span>
      <span className="summary-value">
        <span className="big-number">{value}</span>
        <span className="muted summary-caption">{note}</span>
      </span>
    </div>
  )
}

/** The battery as a tall bar: its level, the reserve line, and whether it's filling or emptying. */
function BatteryGauge({ pct, reserve, kwh, watts }: { pct: number | null; reserve: number; kwh: number | null; watts: number }) {
  const level = pct ?? 0
  const low = level <= reserve + 10
  return (
    <div className="battery-gauge" role="img" aria-label={`Battery ${pct === null ? 'unknown' : `${Math.round(level)}%`}, reserve ${reserve}%`}>
      <div className="battery-shell">
        <div className={`battery-fill${low ? ' low' : ''}${watts < -30 ? ' charging' : ''}`} style={{ height: `${level}%` }} />
        <div className="battery-reserve" style={{ bottom: `${reserve}%` }} />
      </div>
      <div className="battery-read">
        <strong>{pct === null ? '—' : `${Math.round(level)}%`}</strong>
        <span className="muted">{kwh ? `${((level / 100) * kwh).toFixed(1)} of ${kwh} kWh` : ''}</span>
        <span className="muted">{watts < -30 ? 'Charging' : watts > 30 ? 'Discharging' : 'Holding'}</span>
      </div>
    </div>
  )
}
