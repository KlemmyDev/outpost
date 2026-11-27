import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { LibraryPage } from '#/features/library/Page'

export const Route = createFileRoute('/library')({
  beforeLoad: requireFeature('library'),
  component: LibraryPage,
})
