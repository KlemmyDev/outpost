import { createFileRoute } from '@tanstack/react-router'
import { getSources } from '#/features/library/library.functions'
import { SourcesPage } from '#/features/library/SourcesPage'

export const Route = createFileRoute('/library/sources')({
  loader: () => getSources(),
  head: () => ({ meta: [{ title: 'Sources · Library · Outpost' }] }),
  component: function SourcesRoute() {
    return <SourcesPage initial={Route.useLoaderData()} />
  },
})
