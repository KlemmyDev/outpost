import { promises as dns } from 'node:dns'
import { connect } from 'node:net'
import type { InternetCheck, InternetStatus } from './types'

const CACHE_MS = 60_000
const TIMEOUT_MS = 4_000
let cached: InternetStatus | null = null
let running: Promise<InternetStatus> | null = null

function tcp(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const socket = connect({ host, port, timeout: TIMEOUT_MS })
    socket.once('connect', () => {
      socket.destroy()
      resolve(Math.round(performance.now() - start))
    })
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('timed out'))
    })
    socket.once('error', (err) => {
      socket.destroy()
      reject(err)
    })
  })
}

async function timed(name: string, run: () => Promise<number | void>, okDetail: string): Promise<InternetCheck> {
  const start = performance.now()
  try {
    const ms = await Promise.race([
      run(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)),
    ])
    return { name, ok: true, ms: typeof ms === 'number' ? ms : Math.round(performance.now() - start), detail: okDetail }
  } catch (err) {
    const message = (err as Error).message
    return { name, ok: false, ms: null, detail: message === 'timed out' ? 'No answer within 4 seconds' : message }
  }
}

/**
 * A light check, at most once a minute: can we reach the outside world, can we
 * look names up, and can we reach GitHub (where updates come from)? Speed
 * tests are heavier and will run on a schedule in a later version.
 */
export async function checkInternet(force = false): Promise<InternetStatus> {
  if (!force && cached && Date.now() - cached.checkedAt < CACHE_MS) return cached
  running ??= (async () => {
    const checks = await Promise.all([
      timed('Reach the internet', () => tcp('1.1.1.1', 443), 'Cloudflare answered'),
      timed('Look up names (DNS)', async () => void (await dns.resolve4('github.com')), 'github.com found'),
      timed('Reach GitHub', () => tcp('github.com', 443), 'Updates can be downloaded'),
    ])
    const okCount = checks.filter((c) => c.ok).length
    const status: InternetStatus = {
      state: okCount === checks.length ? 'online' : okCount === 0 ? 'offline' : 'degraded',
      latencyMs: checks[0]!.ok ? checks[0]!.ms : null,
      checks,
      checkedAt: Date.now(),
    }
    cached = status
    return status
  })().finally(() => {
    running = null
  })
  return running
}
