import { createFileRoute } from '@tanstack/react-router'
import { fail, json, problem, readBody, refuseCrossSite } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/**
 * PUT    /api/features/:id  {"enabled": true|false}  switch a feature on or off
 * DELETE /api/features/:id                           back to its default
 */
export const Route = createFileRoute('/api/features/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        const body = await readBody<{ enabled: boolean }>(request)
        if (typeof body.enabled !== 'boolean') return problem('Send {"enabled": true} or {"enabled": false}.', 400)
        try {
          return json({ features: getPlatform().features.set(params.id, body.enabled) })
        } catch (err) {
          return fail(err)
        }
      },
      DELETE: ({ request, params }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        return json({ features: getPlatform().features.reset(params.id) })
      },
    },
  },
})
