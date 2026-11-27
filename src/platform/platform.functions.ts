import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from './server/platform.server'

/**
 * What every page needs: which features are on and which version is running.
 * The root route loads this on each navigation and puts it in the router
 * context, so `requireFeature()` and the menu always agree with the server.
 */
export const getPlatformInfo = createServerFn({ method: 'GET' }).handler(async () => {
  const p = getPlatform()
  const updates = p.updates.status()
  return {
    features: p.features.list(),
    version: p.version,
    update: {
      available: updates.available,
      channel: updates.channel,
      latestVersion: updates.latest?.version ?? null,
    },
    unreadNotifications: p.notifications.unreadCount(),
  }
})

export type PlatformInfo = Awaited<ReturnType<typeof getPlatformInfo>>
