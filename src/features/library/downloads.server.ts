import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, readdir, rename, stat, statfs, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { FeatureContext } from '#/platform/server/runtime.server'
import { isAllowedSource } from './catalog.server'
import type { LibraryStore } from './store.server'
import type { CatalogEntry, Download, StorageInfo } from './types'

/** Room left on the disk after a download, so the database and backups can still grow. */
export const SPACE_MARGIN = 2 * 1024 ** 3
const SAVE_EVERY_MS = 2000
const RETRIES = [10, 30, 60, 120, 300].map((s) => s * 1000)

export class DownloadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Kiwix content ids are file names without `.zim`; nothing else may reach the disk. */
export function safeContentId(id: string): boolean {
  return /^[\w.-]+$/.test(id) && !id.startsWith('.') && id.length <= 200
}

type StopReason = 'pause' | 'cancel' | 'stop'

interface Live {
  id: number
  abort: AbortController
  bytes: number
  bytesPerSec: number | null
  verified: number | null
}

/**
 * Downloads ZIM files into the library folder, one at a time, in the order
 * they were asked for. A download goes to `<id>.zim.part`, so Kiwix never
 * sees half a file; it resumes where it left off after a pause, a dropped
 * connection or a restart; it's checked against Kiwix's SHA-256 when there is
 * one; and only then renamed to `<id>.zim`, which Kiwix picks up by itself.
 */
export class DownloadManager {
  private live: Live | null = null
  private stopped = false

  constructor(
    private readonly store: LibraryStore,
    readonly dir: string,
    private readonly ctx: Pick<FeatureContext, 'notify' | 'log'>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    await mkdir(this.dir, { recursive: true, mode: 0o755 })
    // Kiwix runs as a different user and needs to read this folder.
    await chmod(this.dir, 0o755).catch(() => {})
    const n = this.store.requeueInterrupted()
    if (n) this.ctx.log(`resuming ${n} download${n === 1 ? '' : 's'}`)
    this.kick()
  }

  stop(): void {
    this.stopped = true
    this.live?.abort.abort('stop' satisfies StopReason)
  }

  list(): Download[] {
    return this.store.downloads().map((d) =>
      this.live && this.live.id === d.id ? { ...d, bytes: this.live.bytes, bytesPerSec: this.live.bytesPerSec, verified: this.live.verified } : d,
    )
  }

  async storage(): Promise<StorageInfo | null> {
    try {
      const fs = await statfs(this.dir)
      let libraryBytes = 0
      for (const f of await readdir(this.dir)) {
        if (f.endsWith('.zim') || f.endsWith('.zim.part')) libraryBytes += (await stat(join(this.dir, f)).catch(() => null))?.size ?? 0
      }
      return { libraryBytes, freeBytes: fs.bavail * fs.bsize, totalBytes: fs.blocks * fs.bsize }
    } catch {
      return null
    }
  }

  async fileSize(contentId: string): Promise<number | null> {
    if (!safeContentId(contentId)) return null
    return (await stat(join(this.dir, `${contentId}.zim`)).catch(() => null))?.size ?? null
  }

  async add(entry: CatalogEntry, replaces: string | null = null): Promise<Download> {
    if (!isAllowedSource(entry.url)) throw new DownloadError('Books can only be downloaded from Kiwix.')
    if (!safeContentId(entry.contentId)) throw new DownloadError("That file name isn't one Outpost can store.")
    if (replaces !== null && !safeContentId(replaces)) throw new DownloadError("That book isn't installed.")
    if ((await this.fileSize(entry.contentId)) !== null) throw new DownloadError(`${entry.title} is already in the library.`, 409)
    const pending = this.store.pendingFor(entry.contentId)
    if (pending) {
      if (pending.state === 'paused' || pending.state === 'failed') this.resume(pending.id)
      return this.store.download(pending.id)!
    }
    const storage = await this.storage()
    const queuedBytes = this.store.active().reduce((sum, d) => sum + Math.max(0, d.sizeBytes - d.bytes), 0)
    if (storage && storage.freeBytes - queuedBytes - entry.sizeBytes < SPACE_MARGIN) {
      throw new DownloadError(`Not enough space: ${entry.title} needs ${gb(entry.sizeBytes)} and ${gb(Math.max(0, storage.freeBytes - queuedBytes))} is free.`, 507)
    }
    const d = this.store.addDownload({
      name: entry.name,
      flavour: entry.flavour,
      title: entry.title,
      contentId: entry.contentId,
      url: entry.url,
      sizeBytes: entry.sizeBytes,
      replaces,
    })
    this.kick()
    return d
  }

  pause(id: number): void {
    const d = this.store.download(id)
    if (!d) return
    if (this.live?.id === id) this.live.abort.abort('pause' satisfies StopReason)
    else if (d.state === 'queued') this.store.update(id, { state: 'paused' })
  }

  resume(id: number): void {
    const d = this.store.download(id)
    if (d && (d.state === 'paused' || d.state === 'failed')) {
      this.store.update(id, { state: 'queued', error: null })
      this.kick()
    }
  }

  async cancel(id: number): Promise<void> {
    const d = this.store.download(id)
    if (!d || d.state === 'done') return
    if (this.live?.id === id) this.live.abort.abort('cancel' satisfies StopReason)
    this.store.update(id, { state: 'cancelled' })
    await unlink(this.partPath(d)).catch(() => {})
  }

  /** Removes an installed book's file. Kiwix drops it from the library within a few seconds. */
  async remove(contentId: string): Promise<void> {
    if (!safeContentId(contentId)) throw new DownloadError("That book isn't installed.", 404)
    try {
      await unlink(join(this.dir, `${contentId}.zim`))
    } catch {
      throw new DownloadError("That book isn't installed, or was already removed.", 404)
    }
  }

  private partPath(d: Pick<Download, 'contentId'>): string {
    return join(this.dir, `${d.contentId}.zim.part`)
  }

  /** Starts the next queued download if nothing's running. */
  private kick(): void {
    if (this.live || this.stopped) return
    const next = this.store.active().find((d) => d.state === 'queued')
    if (!next) return
    const live: Live = { id: next.id, abort: new AbortController(), bytes: next.bytes, bytesPerSec: null, verified: null }
    this.live = live
    void this.run(next, live).finally(() => {
      if (this.live === live) this.live = null
      // Let the event loop breathe before starting the next one.
      setTimeout(() => this.kick(), 50).unref?.()
    })
  }

  private async run(d: Download, live: Live): Promise<void> {
    const signal = live.abort.signal
    this.store.update(d.id, { state: 'downloading', error: null })
    for (let attempt = 0; ; attempt++) {
      try {
        await this.transfer(d, live)
        break
      } catch (err) {
        if (signal.aborted) return this.stopped_(d, signal.reason as StopReason)
        const message = (err as Error).message
        if (err instanceof DownloadError || attempt >= RETRIES.length) {
          this.store.update(d.id, { state: 'failed', error: message, bytes: live.bytes })
          this.ctx.notify({ level: 'warn', title: `${d.title} didn't download`, body: `${message} Resume it from Library › Sources.` })
          return
        }
        this.ctx.log(`${d.contentId}: ${message}; retrying in ${RETRIES[attempt]! / 1000}s`)
        this.store.update(d.id, { error: `${message} Trying again shortly.`, bytes: live.bytes })
        live.bytesPerSec = null
        if (!(await sleep(RETRIES[attempt]!, signal))) return this.stopped_(d, signal.reason as StopReason)
      }
    }

    // Check the file is what Kiwix published.
    this.store.update(d.id, { state: 'verifying', bytes: live.bytes, error: null })
    live.bytesPerSec = null
    live.verified = 0
    try {
      const expected = await this.expectedHash(d.url, signal)
      if (expected) {
        const actual = await hashFile(this.partPath(d), live.bytes, signal, (f) => (live.verified = f))
        if (actual !== expected) {
          await unlink(this.partPath(d)).catch(() => {})
          this.store.update(d.id, { state: 'failed', bytes: 0, error: 'The file arrived damaged, so it was deleted. Try downloading it again.' })
          this.ctx.notify({ level: 'warn', title: `${d.title} arrived damaged`, body: 'It was deleted. Try downloading it again from Library › Sources.' })
          return
        }
      }
    } catch (err) {
      if (signal.aborted) return this.stopped_(d, signal.reason as StopReason)
      this.ctx.log(`${d.contentId}: couldn't verify (${(err as Error).message}), keeping it`)
    }

    const final = join(this.dir, `${d.contentId}.zim`)
    await rename(this.partPath(d), final)
    await chmod(final, 0o644).catch(() => {})
    if (d.replaces && d.replaces !== d.contentId) await unlink(join(this.dir, `${d.replaces}.zim`)).catch(() => {})
    this.store.update(d.id, { state: 'done', bytes: live.bytes, error: null })
    this.ctx.log(`${d.contentId}: done`)
    this.ctx.notify({ level: 'info', title: `${d.title} is ready`, body: `${gb(live.bytes)} downloaded and added to the library.` })
  }

  private stopped_(d: Download, reason: StopReason): void {
    if (reason === 'pause') this.store.update(d.id, { state: 'paused' })
    // 'cancel' set its own state; 'stop' leaves it to be resumed on the next start.
    else if (reason === 'stop') this.store.update(d.id, { bytes: this.live?.bytes ?? d.bytes })
  }

  /** One pass at fetching the rest of the file. Throws on anything short of all of it. */
  private async transfer(d: Download, live: Live): Promise<void> {
    const part = this.partPath(d)
    let have = (await stat(part).catch(() => null))?.size ?? 0
    const storage = await this.storage()
    if (storage && d.sizeBytes - have > storage.freeBytes - SPACE_MARGIN / 2) {
      throw new DownloadError(`The disk is nearly full: ${gb(storage.freeBytes)} free, ${gb(d.sizeBytes - have)} still to download.`)
    }

    const res = await this.fetchImpl(d.url, {
      headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      redirect: 'follow',
      signal: live.abort.signal,
    })
    if (res.status === 416 && have > 0 && have >= d.sizeBytes) {
      live.bytes = have
      return
    }
    if (res.status === 200 && have > 0) {
      // The mirror ignored the range; start again.
      await truncate(part, 0)
      have = 0
    }
    if (res.status !== 200 && res.status !== 206) throw new Error(`The download server answered ${res.status}.`)
    if (!res.body) throw new Error('The download server sent nothing.')

    const total = totalSize(res, have) ?? d.sizeBytes
    if (total !== d.sizeBytes) {
      this.store.update(d.id, { sizeBytes: total })
      d.sizeBytes = total
    }

    live.bytes = have
    let lastSave = Date.now()
    let window = { at: Date.now(), bytes: have }
    const counter = new Transform({
      transform: (chunk: Buffer, _enc, cb) => {
        live.bytes += chunk.length
        const now = Date.now()
        if (now - window.at >= 1000) {
          const rate = ((live.bytes - window.bytes) * 1000) / (now - window.at)
          live.bytesPerSec = live.bytesPerSec === null ? rate : live.bytesPerSec * 0.7 + rate * 0.3
          window = { at: now, bytes: live.bytes }
        }
        if (now - lastSave >= SAVE_EVERY_MS) {
          lastSave = now
          this.store.update(d.id, { bytes: live.bytes })
        }
        cb(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>),
      counter,
      createWriteStream(part, { flags: have > 0 ? 'a' : 'w', mode: 0o644 }),
      { signal: live.abort.signal },
    )
    this.store.update(d.id, { bytes: live.bytes })
    if (live.bytes < total) throw new Error(`The connection dropped at ${gb(live.bytes)} of ${gb(total)}.`)
  }

  private async expectedHash(url: string, signal: AbortSignal): Promise<string | null> {
    try {
      const res = await this.fetchImpl(`${url}.sha256`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'follow' })
      if (!res.ok) return null
      const m = /^[0-9a-f]{64}/i.exec((await res.text()).trim())
      return m ? m[0].toLowerCase() : null
    } catch (err) {
      if (signal.aborted) throw err
      return null
    }
  }
}

function totalSize(res: Response, have: number): number | null {
  const range = res.headers.get('content-range')
  const m = range ? /\/(\d+)$/.exec(range) : null
  if (m) return Number(m[1])
  const len = Number(res.headers.get('content-length'))
  return Number.isFinite(len) && len > 0 ? len + (res.status === 206 ? have : 0) : null
}

async function hashFile(path: string, size: number, signal: AbortSignal, progress: (f: number) => void): Promise<string> {
  const hash = createHash('sha256')
  let done = 0
  const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })
  for await (const chunk of stream) {
    if (signal.aborted) {
      stream.destroy()
      throw new Error('aborted')
    }
    hash.update(chunk as Buffer)
    done += (chunk as Buffer).length
    progress(size > 0 ? Math.min(1, done / size) : 0)
  }
  return hash.digest('hex')
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false)
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    t.unref?.()
    const onAbort = () => {
      clearTimeout(t)
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function gb(bytes: number): string {
  const g = bytes / 1024 ** 3
  return g >= 10 ? `${Math.round(g)} GB` : g >= 1 ? `${g.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}
