import { createFileRoute } from '@tanstack/react-router'
import { problem } from '#/platform/server/http.server'
import { getLibraryReady } from '#/features/library/server'

/** GET /api/library/icon/:uuid  an installed book's icon, from Kiwix. */
export const Route = createFileRoute('/api/library/icon/$uuid')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const library = await getLibraryReady()
        if (!library || !/^[0-9a-f-]{36}$/i.test(params.uuid)) return problem('No such icon.', 404)
        try {
          const res = await library.kiwix.illustration(params.uuid, 48)
          if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return problem('No such icon.', 404)
          return new Response(res.body, {
            headers: {
              'Content-Type': res.headers.get('content-type')!,
              'Cache-Control': 'private, max-age=604800',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': 'sandbox',
            },
          })
        } catch {
          return problem("The library server isn't answering.", 503)
        }
      },
    },
  },
})
