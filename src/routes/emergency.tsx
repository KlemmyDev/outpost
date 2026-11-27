import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { EmergencyPage } from '#/features/emergency/Page'

export const Route = createFileRoute('/emergency')({
  beforeLoad: requireFeature('emergency'),
  component: EmergencyPage,
})
