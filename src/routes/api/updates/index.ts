import { createFileRoute } from '@tanstack/react-router'
import { json, problem, readBody, refuseCrossSite } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/**
 * GET /api/updates                        current version, latest release, installer state
 * PUT /api/updates {"autoCheck": bool}    turn the 6-hourly GitHub check on or off
 */
export const Route = createFileRoute('/api/updates/')({
  server: {
    handlers: {
      GET: () => json(getPlatform().updates.status()),
      PUT: async ({ request }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        const body = await readBody<{ autoCheck: boolean }>(request)
        if (typeof body.autoCheck !== 'boolean') return problem('Send {"autoCheck": true} or {"autoCheck": false}.', 400)
        return json(getPlatform().updates.setAutoCheck(body.autoCheck))
      },
    },
  },
})
