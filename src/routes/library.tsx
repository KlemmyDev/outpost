import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'

/** Every Library page: home, search, the reader, sources and saved. */
export const Route = createFileRoute('/library')({
  beforeLoad: requireFeature('library'),
  component: Outlet,
})
