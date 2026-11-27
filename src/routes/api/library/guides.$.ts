import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { problem } from '#/platform/server/http.server'
import { getPlatform } from '#/platform/server/platform.server'
import { guide } from '#/features/library/guides/catalog'
import { getLibraryReady } from '#/features/library/server'

/** What a saved picture is, from its first bytes. */
function imageType(buf: Buffer): string | null {
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(buf.subarray(0, 512).toString('utf8'))) return 'image/svg+xml'
  return null
}

/**
 * GET /api/library/guides/<id>.pdf      a saved guide's PDF, as published
 * GET /api/library/guides/<id>/<file>   a picture from a saved guide page
 */
export const Route = createFileRoute('/api/library/guides/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!getPlatform().features.isEnabled('library')) return problem('The Library is switched off.', 404)
        const library = await getLibraryReady()
        if (!library) return problem('The Library is still starting.', 503)
        const rest = params._splat ?? ''
        const pdf = /^([a-z0-9-]+)\.pdf$/.exec(rest)
        const img = /^([a-z0-9-]+)\/(\d{1,3}\.[a-z]{2,4})$/.exec(rest)
        const id = pdf?.[1] ?? img?.[1]
        if (!id || !guide(id)) return problem('No such guide.', 404)
        const path = pdf ? join(library.guides.dir, `${id}.pdf`) : join(library.guides.dir, id, img![2]!)
        const info = await stat(path).catch(() => null)
        if (!info?.isFile()) return problem("That guide isn't saved on this server.", 404)
        const buf = await readFile(path)
        const type = pdf ? 'application/pdf' : imageType(buf)
        if (!type) return problem('Not a picture.', 404)
        const headers: Record<string, string> = {
          'Content-Type': type,
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        }
        if (type === 'image/svg+xml') headers['Content-Security-Policy'] = 'sandbox'
        if (pdf) headers['Content-Disposition'] = `inline; filename="${id}.pdf"`
        return new Response(buf, { headers })
      },
    },
  },
})
