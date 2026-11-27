import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { MessagesPage } from '#/features/messages/Page'

export const Route = createFileRoute('/messages')({
  beforeLoad: requireFeature('messages'),
  component: MessagesPage,
})
