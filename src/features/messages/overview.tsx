import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature }) => (
    <SummaryCard
      label={feature.name}
      icon={feature.icon}
      tone="eucalypt"
      value="No radio"
      caption="Plug a MeshCore radio into the server to message your group off-grid."
    />
  ),
}
