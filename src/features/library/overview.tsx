import { Link } from '@tanstack/react-router'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

const PLANNED = [
  { name: 'Wikipedia', note: 'English, with pictures, about 110 GB' },
  { name: 'WikiMed', note: 'Medical articles, about 2 GB' },
  { name: 'First aid guidelines', note: 'Australian Resuscitation Council' },
  { name: 'Wikibooks Cookbook', note: 'Recipes and techniques' },
  { name: 'Australian food data', note: 'FSANZ food composition' },
]

export const widget: OverviewWidget = {
  Card: ({ feature, onOpen }) => (
    <SummaryCard
      label={feature.name}
      icon={feature.icon}
      tone="dusk"
      value="Empty"
      caption="Nothing downloaded yet."
      footer="Wikipedia, WikiMed and recipes, readable offline"
      onOpen={onOpen}
    />
  ),
  Detail: () => (
    <>
      <p style={{ margin: 0, lineHeight: 1.55 }}>
        The library stores whole collections on this server so they work with no internet. Choosing and downloading them comes
        with the Sources screen, next on the list.
      </p>
      <div className="rows">
        {PLANNED.map((s) => (
          <div key={s.name} className="row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>{s.name}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {s.note}
              </span>
            </span>
            <span className="mono">NOT YET</span>
          </div>
        ))}
      </div>
      <Link to="/library" className="btn secondary" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
        Open Library
      </Link>
    </>
  ),
}
