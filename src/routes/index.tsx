import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '#/features/overview/Page'
import { getOverviewData } from '#/platform/overview.functions'

export const Route = createFileRoute('/')({
  loader: () => getOverviewData(),
  component: function Overview() {
    return <OverviewPage data={Route.useLoaderData()} />
  },
})
