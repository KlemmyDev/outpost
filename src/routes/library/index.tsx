import { createFileRoute } from '@tanstack/react-router'
import { LibraryHomePage } from '#/features/library/Home'
import { getHubFeed, getLibraryHome } from '#/features/library/library.functions'

export const Route = createFileRoute('/library/')({
  // Today's picks are kept for the day, so they're usually instant; if they're slow, the page fetches them itself.
  loader: async () => {
    const [data, feed] = await Promise.all([getLibraryHome(), Promise.race([getHubFeed({ data: {} }).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))])])
    return { data, feed }
  },
  head: () => ({ meta: [{ title: 'Library · Outpost' }] }),
  component: function LibraryHomeRoute() {
    const { data, feed } = Route.useLoaderData()
    return <LibraryHomePage data={data} feed={feed} />
  },
})
