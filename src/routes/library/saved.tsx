import { createFileRoute } from '@tanstack/react-router'
import { getSaved } from '#/features/library/library.functions'
import { SavedPage, type SavedTab } from '#/features/library/SavedPage'

export const Route = createFileRoute('/library/saved')({
  validateSearch: (s: Record<string, unknown>): { tab: SavedTab } => ({ tab: s.tab === 'history' ? 'history' : 'saved' }),
  loader: () => getSaved(),
  head: () => ({ meta: [{ title: 'Saved · Outpost' }] }),
  component: function SavedRoute() {
    const { tab } = Route.useSearch()
    const { saved, history } = Route.useLoaderData()
    return <SavedPage tab={tab} saved={saved} history={history} />
  },
})
