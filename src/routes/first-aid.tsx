import { createFileRoute } from '@tanstack/react-router'
import { requireFeature } from '#/platform/features/guard'
import { FirstAidPage } from '#/features/first-aid/Page'

export const Route = createFileRoute('/first-aid')({
  beforeLoad: requireFeature('first-aid'),
  component: FirstAidPage,
})
