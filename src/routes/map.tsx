import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { MapPage } from '#/features/map/Page'

export const Route = createFileRoute('/map')({
  beforeLoad: requireFeature('map'),
  component: MapPage,
})
