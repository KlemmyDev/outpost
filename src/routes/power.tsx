import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { getPowerData } from '#/features/power/power.functions'
import { PowerPage } from '#/features/power/Page'

export const Route = createFileRoute('/power')({
  beforeLoad: requireFeature('power'),
  loader: () => getPowerData(),
  head: () => ({ meta: [{ title: 'Power · Outpost' }] }),
  component: function PowerRoute() {
    return <PowerPage initial={Route.useLoaderData()} />
  },
})
