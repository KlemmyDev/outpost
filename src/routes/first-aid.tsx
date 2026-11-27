import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'

/** First aid: the topics, and a page for each. */
export const Route = createFileRoute('/first-aid')({
  beforeLoad: requireFeature('first-aid'),
  component: Outlet,
})
