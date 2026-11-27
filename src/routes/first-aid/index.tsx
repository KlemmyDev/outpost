import { createFileRoute } from '@tanstack/react-router'
import { getFirstAid } from '#/features/first-aid/first-aid.functions'
import { FirstAidPage } from '#/features/first-aid/Page'

export const Route = createFileRoute('/first-aid/')({
  loader: () => getFirstAid(),
  head: () => ({ meta: [{ title: 'First aid · Outpost' }] }),
  component: function FirstAidRoute() {
    return <FirstAidPage initial={Route.useLoaderData()} />
  },
})
