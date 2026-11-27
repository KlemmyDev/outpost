import { createFileRoute } from '@tanstack/react-router'
import { problem } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'
import { safeContentId } from '#/features/library/downloads.server'
import { getLibraryReady } from '#/features/library/server'
import { isAppBook } from '#/features/library/types'

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
        // Pass on ranges (video, big files) and revalidation, so a cached copy costs a 304.
        const forward: Record<string, string> = {}
        for (const h of ['range', 'if-none-match', 'if-modified-since']) {
          const v = request.headers.get(h)
          if (v) forward[h] = v
        }
        let res: Response
        try {
          res = await library.kiwix.raw(params.book, rest, { headers: forward, signal: request.signal })
        } catch {
          return problem("The library server isn't answering.", 503)
        }
        if (res.status === 304) return new Response(null, { status: 304, headers: { etag: res.headers.get('etag') ?? '', 'Cache-Control': 'no-cache' } })
        if (!res.ok) {
          await res.body?.cancel()
          return problem('No such file.', res.status === 404 ? 404 : 502)
        }
        const headers = new Headers()
        // fetch() has already unzipped a compressed body, so its length no longer applies.
        const unzipped = res.headers.has('content-encoding')
        for (const h of PASS) {
          if (unzipped && (h === 'content-length' || h === 'content-range' || h === 'accept-ranges')) continue
          const v = res.headers.get(h)
          if (v) headers.set(h, v)
        }
        // Always revalidate: cheap, and it means header changes reach browsers at once.
        headers.set('Cache-Control', 'private, no-cache')
        headers.set('X-Content-Type-Options', 'nosniff')
        // Offline maps (openZIM's Maps2ZIM, from Kiwix's catalogue) need browser
        // storage, which a fully sandboxed page doesn't get, so they keep their
        // origin. Everything else from a ZIM runs in a unique one.
        const sandbox = isAppBook({ name: params.book }) ? 'sandbox allow-scripts allow-same-origin allow-popups' : 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'
        headers.set('Content-Security-Policy', `${sandbox}; frame-ancestors 'self'`)
        headers.set('Referrer-Policy', 'no-referrer')
        // Sandboxed pages run in an opaque origin, so their own scripts and
        // tiles (offline maps, say) load as cross-origin requests.
        headers.set('Access-Control-Allow-Origin', '*')
        return new Response(res.body, { status: res.status, headers })
      },
    },
  },
})
