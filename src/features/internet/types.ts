export interface InternetCheck {
  name: string
  ok: boolean
  ms: number | null
  detail: string
}

export interface InternetStatus {
  /** "online": everything answered. "degraded": some did. "offline": nothing did. */
  state: 'online' | 'degraded' | 'offline'
  /** Round trip to Cloudflare's DNS server, a stand-in for "how quick is it". */
  latencyMs: number | null
  checks: InternetCheck[]
  checkedAt: number
}
