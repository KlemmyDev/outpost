import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature }) => (
    <SummaryCard
      label="Backup power"
      icon={feature.icon}
      tone="ochre"
      value="Not connected"
      caption="Point Outpost at your WattsMyPower server to see solar, battery and off-grid runtime."
    />
  ),
}
