import { round1 } from './analyze'
import type { SpeedTest } from './types'

/**
 * Download and upload speed using Cloudflare's public speed test endpoints,
 * the same ones speed.cloudflare.com uses. One connection each way, so very
 * fast plans (several hundred Mbps and up) can read a little low. Timing
 * starts when the first byte arrives, so connection setup isn't counted.
 */
const BASE = 'https://speed.cloudflare.com'
const TIMEOUT_MS = 90_000

const mbps = (bytes: number, ms: number) => round1((bytes * 8) / (ms / 1000) / 1_000_000)

export async function download(bytes: number, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(`${BASE}/__down?bytes=${bytes}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`Download test failed (${res.status})`)
  const reader = res.body.getReader()
  let received = 0
  let first: number | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    first ??= performance.now()
    received += value.byteLength
  }
  const elapsed = performance.now() - (first ?? performance.now())
  if (received < bytes * 0.9 || elapsed <= 0) throw new Error('The download test was cut short')
  return mbps(received, elapsed)!
}

export async function upload(bytes: number, fetchImpl: typeof fetch = fetch): Promise<number> {
  const body = new Uint8Array(bytes)
  const start = performance.now()
  const res = await fetchImpl(`${BASE}/__up`, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  await res.arrayBuffer()
  if (!res.ok) throw new Error(`Upload test failed (${res.status})`)
  return mbps(bytes, performance.now() - start)!
}

export async function speedTest(downloadMB: number, fetchImpl: typeof fetch = fetch): Promise<SpeedTest> {
  const at = Date.now()
  try {
    const downMbps = await download(Math.round(downloadMB * 1_000_000), fetchImpl)
    const upMbps = await upload(Math.round(downloadMB * 0.4 * 1_000_000), fetchImpl)
    return { at, ok: true, downMbps, upMbps, error: null }
  } catch (err) {
    const message = (err as Error).name === 'TimeoutError' ? 'The speed test took too long' : (err as Error).message
    return { at, ok: false, downMbps: null, upMbps: null, error: message || "Couldn't reach the speed test server" }
  }
}
