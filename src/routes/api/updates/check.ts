import { createFileRoute } from '@tanstack/react-router'
import { json, refuseCrossSite } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/** POST /api/updates/check  ask GitHub now instead of waiting for the next 6-hourly check. */
export const Route = createFileRoute('/api/updates/check')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        const { updates } = getPlatform()
        await updates.check()
        return json(updates.status())
      },
    },
  },
})
