import { Link } from '@tanstack/react-router'
import type { OverviewWidget } from '#/platform/features/widget'

/** Australian numbers. Shown even when everything else is offline. */
export const EMERGENCY_NUMBERS = [
  { number: '000', name: 'Police, fire, ambulance', note: 'Life-threatening emergencies. 112 also works from mobiles.' },
  { number: '13 11 26', name: 'Poisons Information Centre', note: 'Any time, anywhere in Australia.' },
  { number: '132 500', name: 'SES', note: 'Flood and storm help.' },
  { number: '1800 022 222', name: 'healthdirect', note: 'Advice from a registered nurse, any time.' },
] as const

export const widget: OverviewWidget = {
  Card: ({ data, onOpen }) => {
    const s = data.emergency
    const level = s?.highest
    return (
      <button type="button" className={`summary-card dark${level === 'Emergency Warning' || level === 'Watch and Act' ? ' alarm' : ''}`} onClick={onOpen}>
        <span className="summary-label" style={{ color: '#f0a39b' }}>
          <span className="mono" style={{ color: '#f0a39b', letterSpacing: '0.1em' }}>
            EMERGENCY
          </span>
          <span aria-hidden="true" className="chevron">
            ›
          </span>
        </span>
        <span className="big-number" style={{ fontSize: 34 }}>
          000 · 13 11 26
        </span>
        <span className="muted summary-caption">
          {!s
            ? 'Police, fire, ambulance · Poisons · SES 132 500'
            : s.near > 0
              ? `${s.near} warning${s.near === 1 ? '' : 's'} near home${level ? `, up to ${level}` : ''}`
              : `No warnings near home${s.weather ? ` · ${s.weather} weather warning${s.weather === 1 ? '' : 's'} in the state` : ''}`}
        </span>
        {s && (
          <span className="muted summary-footer" style={{ color: '#b9b4aa' }}>
            Kit {s.kitHave}/{s.kitTotal}
            {s.planDone ? ' · plan ready' : ' · plan not filled in'}
          </span>
        )}
      </button>
    )
  },
  Detail: ({ data }) => {
    const s = data.emergency
    return (
      <>
        <div className="notice bad" style={{ fontSize: 15 }}>
          In a life-threatening emergency, call <strong>000</strong> first.
        </div>
        <div className="rows">
          {EMERGENCY_NUMBERS.map((n) => (
            <a key={n.number} className="row lib-row-link" href={`tel:${n.number.replace(/\s/g, '')}`}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong>{n.name}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {n.note}
                </span>
              </span>
              <span className="big-number" style={{ fontSize: 20 }}>
                {n.number}
              </span>
            </a>
          ))}
        </div>
        {s && (
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            {s.near > 0 ? `${s.near} fire or emergency warning${s.near === 1 ? '' : 's'} near home.` : 'No fire or emergency warnings near home.'} Emergency kit {s.kitHave} of {s.kitTotal} packed.
          </p>
        )}
        <Link to="/emergency" className="btn accent" style={{ alignSelf: 'flex-start' }}>
          Open Emergency
        </Link>
      </>
    )
  },
}
