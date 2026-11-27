import { createFileRoute } from '@tanstack/react-router'
import { json } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

export const Route = createFileRoute('/api/features/')({
  server: {
    handlers: {
      GET: () => json({ features: getPlatform().features.list() }),
    },
  },
})
