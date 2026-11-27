import { createFileRoute } from '@tanstack/react-router'
import { LibraryHomePage } from '#/features/library/Home'
import { getLibraryHome } from '#/features/library/library.functions'

export const Route = createFileRoute('/library/')({
  loader: () => getLibraryHome(),
  head: () => ({ meta: [{ title: 'Library · Outpost' }] }),
  component: function LibraryHomeRoute() {
    return <LibraryHomePage data={Route.useLoaderData()} />
  },
})
