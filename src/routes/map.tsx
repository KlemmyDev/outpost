import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { getMapData } from '#/features/map/map.functions'
import { MapPage } from '#/features/map/Page'

export const Route = createFileRoute('/map')({
  beforeLoad: requireFeature('map'),
  loader: () => getMapData(),
  head: () => ({ meta: [{ title: 'Map · Outpost' }] }),
  component: function MapRoute() {
    return <MapPage data={Route.useLoaderData()} />
  },
})
