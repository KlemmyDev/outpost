import { createFileRoute, notFound } from '@tanstack/react-router'
import { getFirstAid } from '#/features/first-aid/first-aid.functions'
import { TopicPage } from '#/features/first-aid/TopicPage'
import { topic } from '#/features/first-aid/topics'

export const Route = createFileRoute('/first-aid/$topic')({
  loader: async ({ params }) => {
    const t = topic(params.topic)
    if (!t) throw notFound()
    return { data: await getFirstAid(), id: t.id }
  },
  head: ({ params }) => ({ meta: [{ title: `${topic(params.topic)?.title ?? 'First aid'} · Outpost` }] }),
  component: function TopicRoute() {
    const { data, id } = Route.useLoaderData()
    return <TopicPage key={id} t={topic(id)!} initial={data} />
  },
})
