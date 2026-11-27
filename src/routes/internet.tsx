import { createFileRoute } from '@tanstack/react-router'
import { widget } from '#/features/internet/overview'
import { requireFeature } from '#/platform/features/guard'
import { getOverviewData } from '#/platform/overview.functions'

export const Route = createFileRoute('/internet')({
  beforeLoad: requireFeature('internet'),
  loader: () => getOverviewData(),
  component: function InternetPage() {
    const data = Route.useLoaderData()
    const { feature } = Route.useRouteContext()
    const Detail = widget.Detail!
    return (
      <main className="page" style={{ maxWidth: 720 }}>
        <span className="eyebrow">{feature.code}</span>
        <h1>{feature.name}</h1>
        <Detail feature={feature} data={data.widgets} />
      </main>
    )
  },
})
