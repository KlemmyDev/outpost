import { Link } from '@tanstack/react-router'
import { Meter, SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'
import { hoursLabel, kw } from './runtime'

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data.power
    const ok = s && (s.state === 'ok' || s.state === 'stale')
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone={s?.offGrid ? 'flare' : 'ochre'}
        value={!s ? '—' : s.state === 'unconfigured' ? 'Not set up' : !ok ? 'Offline' : s.batteryPct !== null ? `${Math.round(s.batteryPct)}%` : kw(s.solarW ?? 0)}
        caption={
          !s || s.state === 'unconfigured'
            ? 'Connect WattsMyPower to see solar, the battery and off-grid runtime.'
            : !ok
              ? "Can't reach WattsMyPower."
              : s.offGrid
                ? `Grid down · ${s.runtimeH !== null ? `about ${hoursLabel(s.runtimeH)} left` : 'on the battery'}`
                : `Solar ${kw(s.solarW ?? 0)} · home ${kw(s.homeW ?? 0)}`
        }
        visual={
          ok && s.batteryPct !== null ? (
            <div className="meter-track" aria-hidden="true">
              <div style={{ width: `${s.batteryPct}%`, background: s.offGrid ? 'var(--flare)' : 'var(--eucalypt-ink)' }} />
            </div>
          ) : undefined
        }
        footer={ok ? (s.lastsForecast ? 'Lasts the next two days off-grid' : s.runtimeH !== null ? `Off-grid: ${hoursLabel(s.runtimeH)}` : 'Battery and solar') : 'From WattsMyPower'}
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data.power
    return (
      <>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {s?.state === 'ok' || s?.state === 'stale'
            ? s.offGrid
              ? 'The grid is down and the house is running on the battery.'
              : `Solar is making ${kw(s.solarW ?? 0)} and the house is using ${kw(s.homeW ?? 0)}.`
            : 'Power reads your inverter through WattsMyPower, and works out how long the battery would last without the grid.'}
        </p>
        {s?.batteryPct !== null && s?.batteryPct !== undefined && <Meter label="Battery" value={Math.round(s.batteryPct)} detail={s.runtimeH !== null ? `${hoursLabel(s.runtimeH)} off-grid` : ''} />}
        <Link to="/power" className="btn accent" style={{ alignSelf: 'flex-start' }}>
          Open Power
        </Link>
      </>
    )
  },
}
