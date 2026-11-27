import { createFileRoute } from '@tanstack/react-router'
import { problem } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'
import { getMap } from '#/features/map/server'
import { KIND_STYLE } from '#/features/map/types'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** GET /api/map/waypoints.gpx  every waypoint, for GPS units and other map apps. */
export const Route = createFileRoute('/api/map/waypoints.gpx')({
  server: {
    handlers: {
      GET: () => {
        if (!getPlatform().features.isEnabled('map')) return problem('The Map is switched off.', 404)
        const map = getMap()
        if (!map) return problem('The Map is still starting.', 503)
        const wpts = map.store
          .waypoints()
          .map(
            (w) =>
              `  <wpt lat="${w.lat}" lon="${w.lon}">\n    <time>${new Date(w.updatedAt).toISOString()}</time>\n    <name>${esc(w.name)}</name>\n${w.notes ? `    <desc>${esc(w.notes)}</desc>\n` : ''}    <type>${esc(KIND_STYLE[w.kind].label)}</type>\n  </wpt>`,
          )
          .join('\n')
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>Outpost waypoints</name><time>${new Date().toISOString()}</time></metadata>\n${wpts}\n</gpx>\n`
        return new Response(gpx, {
          headers: {
            'Content-Type': 'application/gpx+xml',
            'Content-Disposition': 'attachment; filename="outpost-waypoints.gpx"',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
