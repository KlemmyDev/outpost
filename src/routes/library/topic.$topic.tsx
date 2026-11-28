import { createFileRoute, notFound } from '@tanstack/react-router'
import { topic } from '#/features/library/hub'
import { getTopicReads } from '#/features/library/library.functions'
import { TopicPage } from '#/features/library/TopicPage'

export const Route = createFileRoute('/library/topic/$topic')({
  loader: async ({ params }) => {
    const t = topic(params.topic)
    if (!t) throw notFound()
    return { id: t.id, reads: await getTopicReads({ data: { id: t.id } }).catch(() => null) }
  },
  head: ({ params }) => ({ meta: [{ title: `${topic(params.topic)?.title ?? 'Topic'} · Library · Outpost` }] }),
  component: function TopicRoute() {
    const { id, reads } = Route.useLoaderData()
    return <TopicPage key={id} t={topic(id)!} data={reads} />
  },
})
