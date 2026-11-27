import { createFileRoute } from '@tanstack/react-router'
import { json } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'

/** Used by the Docker healthcheck and by install.sh after an update. */
export const Route = createFileRoute('/api/healthz')({
  server: {
    handlers: {
      GET: () => {
        const p = getPlatform()
        p.db.prepare('SELECT 1').get()
        return json({
          ok: true,
          version: p.version.version,
          release: p.version.release,
          commit: p.version.commit,
          uptime: Math.round((Date.now() - p.startedAt) / 1000),
        })
      },
    },
  },
})
