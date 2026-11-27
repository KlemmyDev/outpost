import { createFileRoute } from '@tanstack/react-router'
import { getInternetDashboard } from '#/features/internet/internet.functions'
import { InternetDashboard } from '#/features/internet/Page'
import { RANGES, type Range } from '#/features/internet/types'
import { requireFeature } from '#/platform/features/guard'

export const Route = createFileRoute('/internet')({
  validateSearch: (search: Record<string, unknown>): { range: Range } => ({
    range: (RANGES as readonly string[]).includes(String(search.range)) ? (search.range as Range) : '24h',
  }),
  beforeLoad: requireFeature('internet'),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => getInternetDashboard({ data: { range: deps.range } }),
  component: function InternetRoute() {
    const data = Route.useLoaderData()
    const { range } = Route.useSearch()
    return <InternetDashboard data={data} range={range} />
  },
})
