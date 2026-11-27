import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { getMessagesData } from '#/features/messages/messages.functions'
import { MessagesPage } from '#/features/messages/Page'

export const Route = createFileRoute('/messages')({
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s.c === 'string' && /^(ch:\d{1,3}|dm:[0-9a-f]{12,64})$/.test(s.c) ? { c: s.c } : {}),
  beforeLoad: requireFeature('messages'),
  loader: () => getMessagesData(),
  head: () => ({ meta: [{ title: 'Messages · Outpost' }] }),
  component: function MessagesRoute() {
    const { c } = Route.useSearch()
    return <MessagesPage initial={Route.useLoaderData()} open={c ?? null} />
  },
})
