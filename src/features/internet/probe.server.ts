import { promises as dns } from 'node:dns'
import { connect } from 'node:net'
import { classify, round1, summarise } from './analyze'
import type { InternetCheck, InternetSettings, Sample } from './types'

/**
 * Three independent targets, so one service having a bad day doesn't look
 * like your internet going down. Port 443 is open almost everywhere, and a
 * TCP connect is a fair stand-in for ping without needing raw sockets.
 */
export const TARGETS = [
  { name: 'Cloudflare', host: '1.1.1.1', port: 443 },
  { name: 'Google DNS', host: '8.8.8.8', port: 443 },
  { name: 'GitHub', host: 'github.com', port: 443 },
] as const

const ATTEMPTS = 3
const TIMEOUT_MS = 3_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function tcpConnect(host: string, port: number, timeoutMs = TIMEOUT_MS): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const socket = connect({ host, port, timeout: timeoutMs })
    const done = (err?: Error) => {
      socket.destroy()
      if (err) reject(err)
      else resolve(performance.now() - start)
    }
    socket.once('connect', () => done())
    socket.once('timeout', () => done(new Error('No answer')))
    socket.once('error', (err) => done(err))
  })
}

async function dnsTime(): Promise<{ ms: number | null; error: string | null }> {
  const start = performance.now()
  try {
    // dns.resolve asks the configured server directly, so it isn't answered
    // from a local cache.
    await Promise.race([dns.resolve4('github.com'), sleep(TIMEOUT_MS).then(() => Promise.reject(new Error('No answer')))])
    return { ms: round1(performance.now() - start), error: null }
  } catch (err) {
    return { ms: null, error: (err as Error).message }
  }
}

/** One probe: 3 connects to each target, spaced out a little, plus a DNS lookup. */
export async function probe(settings: InternetSettings): Promise<Sample> {
  const at = Date.now()
  const [dnsResult, perTarget] = await Promise.all([
    dnsTime(),
    Promise.all(
      TARGETS.map(async (t) => {
        const attempts: (number | null)[] = []
        let lastError = ''
        for (let i = 0; i < ATTEMPTS; i++) {
          try {
            attempts.push(await tcpConnect(t.host, t.port))
          } catch (err) {
            attempts.push(null)
            lastError = (err as Error).message
          }
          if (i < ATTEMPTS - 1) await sleep(150)
        }
        return { target: t, attempts, lastError }
      }),
    ),
  ])

  const all = perTarget.flatMap((p) => p.attempts)
  const { latencyMs, jitterMs, lossPct } = summarise(all)
  const checks: InternetCheck[] = perTarget.map(({ target, attempts, lastError }) => {
    const s = summarise(attempts)
    const answered = attempts.filter((a) => a !== null).length
    return {
      name: target.name,
      ok: answered > 0,
      ms: s.latencyMs,
      detail: answered === ATTEMPTS ? 'Answered every time' : answered === 0 ? lastError || 'No answer' : `Answered ${answered} of ${ATTEMPTS}`,
    }
  })
  checks.push({
    name: 'Name lookups (DNS)',
    ok: dnsResult.ms !== null,
    ms: dnsResult.ms,
    detail: dnsResult.error ?? 'Working',
  })

  return { at, health: classify({ latencyMs, lossPct }, settings), latencyMs, jitterMs, lossPct, dnsMs: dnsResult.ms, checks }
}
