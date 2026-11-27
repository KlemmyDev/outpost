import type { OverviewWidget } from '#/platform/features/widget'

/** Australian numbers. Shown even when everything else is offline. */
export const EMERGENCY_NUMBERS = [
  { number: '000', name: 'Police, fire, ambulance', note: 'Life-threatening emergencies. 112 also works from mobiles.' },
  { number: '13 11 26', name: 'Poisons Information Centre', note: 'Any time, anywhere in Australia.' },
  { number: '132 500', name: 'SES', note: 'Flood and storm help.' },
  { number: '1800 022 222', name: 'healthdirect', note: 'Advice from a registered nurse, any time.' },
] as const

export const widget: OverviewWidget = {
  Card: ({ onOpen }) => (
    <button type="button" className="summary-card dark" onClick={onOpen}>
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
      <span className="muted summary-caption">Police, fire, ambulance · Poisons · SES 132 500</span>
    </button>
  ),
  Detail: () => (
    <>
      <div className="notice bad" style={{ fontSize: 15 }}>
        In a life-threatening emergency, call <strong>000</strong> first.
      </div>
      <div className="rows">
        {EMERGENCY_NUMBERS.map((n) => (
          <div key={n.number} className="row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>{n.name}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {n.note}
              </span>
            </span>
            <a href={`tel:${n.number.replaceAll(' ', '')}`} className="big-number" style={{ fontSize: 24, textDecoration: 'none' }}>
              {n.number}
            </a>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Bushfire, flood and storm plans are coming to the Emergency section.
      </p>
    </>
  ),
}
