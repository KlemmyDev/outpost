import { notFound } from '@tanstack/react-router'
import type { FeatureState } from './types'

/**
 * Use as a route's `beforeLoad` so the page only exists while its feature is
 * on. The root route puts the current feature list in the router context on
 * every navigation, so switching a feature off takes effect immediately.
 *
 *   export const Route = createFileRoute('/library')({
 *     beforeLoad: requireFeature('library'),
 *     component: LibraryPage,
 *   })
 */
export function requireFeature(id: string) {
  return ({ context }: { context: { platform: { features: FeatureState[] } } }) => {
    const feature = context.platform.features.find((f) => f.id === id)
    if (!feature?.enabled) throw notFound({ data: { feature: id } })
    return { feature }
  }
}
