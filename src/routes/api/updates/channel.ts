import { createFileRoute } from '@tanstack/react-router'
import { isChannel } from '#/platform/updates/channels'
import { json, problem, readBody, refuseCrossSite } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/** PUT /api/updates/channel {"channel": "nightly"|"beta"|"stable"} */
export const Route = createFileRoute('/api/updates/channel')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const refused = refuseCrossSite(request)
        if (refused) return refused
        const body = await readBody<{ channel: string }>(request)
        if (!isChannel(body.channel)) return problem('Channel must be "nightly", "beta" or "stable".', 400)
        return json(await getPlatform().updates.setChannel(body.channel))
      },
    },
  },
})
