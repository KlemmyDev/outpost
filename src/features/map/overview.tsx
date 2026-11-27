import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature }) => (
    <SummaryCard
      label={feature.name}
      icon={feature.icon}
      tone="eucalypt"
      value="No maps yet"
      caption="Maps of Australia, about 20 GB, download from Sources."
    />
  ),
}
