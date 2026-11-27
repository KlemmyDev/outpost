import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { PowerPage } from '#/features/power/Page'

export const Route = createFileRoute('/power')({
  beforeLoad: requireFeature('power'),
  component: PowerPage,
})
