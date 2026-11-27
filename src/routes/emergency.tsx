import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { getEmergencyData } from '#/features/emergency/emergency.functions'
import { EmergencyPage, type EmergencyTab } from '#/features/emergency/Page'

export const Route = createFileRoute('/emergency')({
  validateSearch: (s: Record<string, unknown>): { tab?: EmergencyTab } => (s.tab === 'plan' || s.tab === 'kit' ? { tab: s.tab } : {}),
  beforeLoad: requireFeature('emergency'),
  loader: () => getEmergencyData(),
  head: () => ({ meta: [{ title: 'Emergency · Outpost' }] }),
  component: function EmergencyRoute() {
    const { tab } = Route.useSearch()
    return <EmergencyPage initial={Route.useLoaderData()} tab={tab ?? 'now'} />
  },
})
