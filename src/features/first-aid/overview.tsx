import { Link } from '@tanstack/react-router'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature, onOpen }) => (
    <SummaryCard
      label={feature.name}
      icon={feature.icon}
      tone="flare"
      value="Call 000 first"
      caption="Then the guides, once the first aid source is downloaded."
      onOpen={onOpen}
    />
  ),
  Detail: () => (
    <>
      <div className="notice bad">In a life-threatening emergency, call 000 before anything else.</div>
      <p style={{ margin: 0, lineHeight: 1.55 }}>
        First aid will show the Australian Resuscitation Council guidelines and WikiMed, word for word and dated, so you know how
        current they are. They arrive with the Sources screen in the library.
      </p>
      <Link to="/first-aid" className="btn secondary" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
        Open First aid
      </Link>
    </>
  ),
}
