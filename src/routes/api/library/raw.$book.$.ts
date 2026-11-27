import { createFileRoute } from '@tanstack/react-router'
import { problem } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'
import { safeContentId } from '#/features/library/downloads.server'
import { getLibraryReady } from '#/features/library/server'

/** Headers passed on from Kiwix. */
const PASS = ['content-type', 'content-length', 'last-modified', 'etag', 'accept-ranges', 'content-range']

/**
 * GET /api/library/raw/:book/*  a file from inside a book, as stored: pictures
 * in the reader, PDFs, and "Original layout" pages.
 *
 * What comes out of a ZIM is someone else's content, so it's served sandboxed:
 * a page opened from here runs in a unique origin with no access to Outpost,
 * and nothing is sniffed into a type it wasn't sent as.
 */
export const Route = createFileRoute('/api/library/raw/$book/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!getPlatform().features.isEnabled('library')) return problem('The Library is switched off.', 404)
        const library = await getLibraryReady()
        if (!library) return problem('The Library is still starting.', 503)
        if (!safeContentId(params.book)) return problem('No such book.', 404)
        // Take the path from the URL as sent, so its encoding reaches Kiwix unchanged.
        const prefix = `/api/library/raw/${encodeURIComponent(params.book)}/`
        const { pathname } = new URL(request.url)
        const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
        if (!rest || rest.split('/').some((s) => s === '..' || s === '.')) return problem('No such file.', 404)
        const range = request.headers.get('range')
        let res: Response
        try {
          res = await library.kiwix.raw(params.book, rest, { headers: range ? { Range: range } : {}, signal: request.signal })
        } catch {
          return problem("The library server isn't answering.", 503)
        }
        if (!res.ok) {
          await res.body?.cancel()
          return problem('No such file.', res.status === 404 ? 404 : 502)
        }
        const headers = new Headers()
        for (const h of PASS) {
          const v = res.headers.get(h)
          if (v) headers.set(h, v)
        }
        headers.set('Cache-Control', 'private, max-age=86400')
        headers.set('X-Content-Type-Options', 'nosniff')
        headers.set('Content-Security-Policy', "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'")
        headers.set('Referrer-Policy', 'no-referrer')
        return new Response(res.body, { status: res.status, headers })
      },
    },
  },
})
