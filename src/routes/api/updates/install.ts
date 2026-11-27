import { createFileRoute } from '@tanstack/react-router'
import { fail, json, refuseCrossSite } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/**
 * POST /api/updates/install
 * Writes data/update/request for updater.sh on the host to pick up within a
 * minute. 409 if the updater isn't running or an update is already under way.
 */
export const Route = createFileRoute('/api/updates/install')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        try {
          return json(getPlatform().updates.requestInstall())
        } catch (err) {
          return fail(err)
        }
      },
    },
  },
})
