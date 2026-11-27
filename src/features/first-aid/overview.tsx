import { Link } from '@tanstack/react-router'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data['first-aid']
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone="flare"
        value="Call 000 first"
        caption={
          !s
            ? 'Then the steps: CPR, bleeding, burns, bites and more.'
            : s.guidesSaved < s.guidesTotal
              ? `Steps for 22 emergencies. Save the full ANZCOR guides (${s.guidesSaved} of ${s.guidesTotal}) while you have internet.`
              : `Steps for 22 emergencies, with the full ANZCOR guides${s.wikimed ? ' and WikiMed' : ''} saved.`
        }
        footer="CPR beat · snake bite · burns · asthma"
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data['first-aid']
    return (
      <>
        <a className="notice bad" href="tel:000" style={{ fontSize: 15, textDecoration: 'none' }}>
          In a life-threatening emergency, call <strong>000</strong> first. Tap to call.
        </a>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          Short steps for 22 emergencies, a CPR beat to follow, and the full Australian Resuscitation Council guidelines
          {s && s.guidesSaved < s.guidesTotal ? ' once they’re saved' : ''}.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/first-aid" className="btn accent">
            Open First aid
          </Link>
          <Link to="/first-aid/$topic" params={{ topic: 'cpr' }} className="btn secondary">
            CPR
          </Link>
        </div>
      </>
    )
  },
}
