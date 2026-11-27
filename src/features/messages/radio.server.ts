import { EventEmitter } from 'node:events'
import type { NodeType, RadioInfo } from './types'

/**
 * What Outpost needs from a MeshCore companion radio. MeshCoreLink speaks to a
 * real one (USB serial or Wi-Fi) through meshcore.js; DemoLink pretends, so
 * the screens can be tried without hardware.
 *
 * Events: 'disconnected', 'messages' (some are waiting), 'adverts' (contacts
 * changed), 'confirmed' (ack code, round trip ms).
 */
export interface RadioLink extends EventEmitter {
  connect(): Promise<void>
  close(): void
  info(): Promise<RadioInfo>
  contacts(): Promise<RawContact[]>
  channels(): Promise<{ idx: number; name: string }[]>
  sendDirect(publicKey: string, text: string): Promise<{ ack: number; timeoutMs: number }>
  sendChannel(idx: number, text: string): Promise<void>
  /** The next waiting message, or null when there are none. */
  nextMessage(): Promise<RawMessage | null>
  advert(): Promise<void>
  setName(name: string): Promise<void>
  setPosition(lat: number, lon: number): Promise<void>
}

export interface RawContact {
  publicKey: string
  name: string
  type: NodeType
  lat: number | null
  lon: number | null
  lastAdvert: number | null
  pathLen: number
}

export type RawMessage =
  | { kind: 'direct'; fromPrefix: string; text: string; sentAt: number; hops: number | null; snr: number | null }
  | { kind: 'channel'; idx: number; text: string; sentAt: number; hops: number | null; snr: number | null }

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

/** Rejects if the radio doesn't answer in time; meshcore.js waits forever otherwise. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`The radio didn't answer (${what}).`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(`The radio refused that (${what}).`))
      },
    )
  })
}

const NODE_TYPES: Record<number, NodeType> = { 1: 'chat', 2: 'repeater', 3: 'room', 4: 'sensor' }

/** Positions come as degrees × 1e6; 0,0 means "not shared". */
function position(lat: number, lon: number): { lat: number | null; lon: number | null } {
  if (!lat && !lon) return { lat: null, lon: null }
  return { lat: lat / 1e6, lon: lon / 1e6 }
}

type Conn = EventEmitter & Record<string, (...args: never[]) => unknown>

/** A real radio through meshcore.js. */
export class MeshCoreLink extends EventEmitter implements RadioLink {
  private conn: Conn | null = null
  private C: { PushCodes: Record<string, number>; ResponseCodes: Record<string, number> } | null = null

  constructor(private readonly target: { transport: 'serial'; path: string } | { transport: 'tcp'; host: string; port: number }) {
    super()
  }

  async connect(): Promise<void> {
    const lib = (await import('@liamcottle/meshcore.js')) as unknown as Record<string, new (...args: unknown[]) => Conn> & { Constants: MeshCoreLink['C'] }
    this.C = lib.Constants
    const conn = this.target.transport === 'serial' ? new lib.NodeJSSerialConnection!(this.target.path) : new lib.TCPConnection!(this.target.host, this.target.port)
    this.conn = conn
    const C = this.C!
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        conn.once('connected', () => resolve())
        conn.once('disconnected', () => reject(new Error('The radio closed the connection.')))
        // meshcore.js only logs these; turn them into a failed connect.
        if (this.target.transport === 'tcp') {
          void (conn.connect as () => Promise<void>)().then(() => {
            const socket = (conn as unknown as { socket?: EventEmitter }).socket
            socket?.once('error', (e: Error) => reject(new Error(`Couldn't reach the radio: ${e.message}`)))
          })
        } else {
          void (conn.connect as () => Promise<void>)().then(() => {
            const port = (conn as unknown as { serialPort?: EventEmitter }).serialPort
            port?.once('error', (e: Error) => reject(new Error(`Couldn't open the radio's port: ${e.message}`)))
          }, reject)
        }
      }),
      15_000,
      'connecting',
    )
    conn.on('disconnected', () => this.emit('disconnected'))
    conn.on(C.PushCodes.MsgWaiting as unknown as string, () => this.emit('messages'))
    conn.on(C.PushCodes.Advert as unknown as string, () => this.emit('adverts'))
    conn.on(C.PushCodes.NewAdvert as unknown as string, () => this.emit('adverts'))
    conn.on(C.PushCodes.PathUpdated as unknown as string, () => this.emit('adverts'))
    conn.on(C.PushCodes.SendConfirmed as unknown as string, (e: { ackCode: number; roundTrip: number }) => this.emit('confirmed', e.ackCode, e.roundTrip))
    // Keep the radio's clock right, so message times make sense.
    await withTimeout((conn.syncDeviceTime as () => Promise<void>)(), 5000, 'setting the clock').catch(() => {})
  }

  close(): void {
    try {
      void (this.conn?.close as () => unknown)?.()
    } catch {
      // Already closed.
    }
    this.conn = null
  }

  private c(): Conn {
    if (!this.conn) throw new Error('The radio is not connected.')
    return this.conn
  }

  async info(): Promise<RadioInfo> {
    const s = (await withTimeout((this.c().getSelfInfo as (t: number) => Promise<Record<string, unknown>>)(8000), 9000, 'reading its settings')) as {
      name: string
      publicKey: Uint8Array
      radioFreq: number
      radioBw: number
      radioSf: number
      radioCr: number
      txPower: number
      advLat: number
      advLon: number
    }
    const battery = await withTimeout((this.c().getBatteryVoltage as () => Promise<{ batteryMilliVolts: number }>)(), 4000, 'battery')
      .then((b) => b.batteryMilliVolts)
      .catch(() => null)
    return {
      name: s.name,
      publicKey: hex(s.publicKey),
      freq: s.radioFreq / 1000,
      bandwidth: s.radioBw / 1000,
      sf: s.radioSf,
      cr: s.radioCr,
      txPower: s.txPower,
      ...position(s.advLat, s.advLon),
      batteryMv: battery,
    }
  }

  async contacts(): Promise<RawContact[]> {
    const list = (await withTimeout((this.c().getContacts as () => Promise<unknown[]>)(), 15_000, 'listing contacts')) as {
      publicKey: Uint8Array
      advName: string
      type: number
      advLat: number
      advLon: number
      lastAdvert: number
      outPathLen: number
    }[]
    return list.map((c) => ({
      publicKey: hex(c.publicKey),
      name: c.advName || hex(c.publicKey).slice(0, 8),
      type: NODE_TYPES[c.type] ?? 'unknown',
      ...position(c.advLat, c.advLon),
      lastAdvert: c.lastAdvert ? c.lastAdvert * 1000 : null,
      pathLen: c.outPathLen,
    }))
  }

  async channels(): Promise<{ idx: number; name: string }[]> {
    const out: { idx: number; name: string }[] = []
    // Companion firmware has a handful of channel slots; stop at the first gap.
    for (let idx = 0; idx < 8; idx++) {
      try {
        const ch = (await withTimeout((this.c().getChannel as (i: number) => Promise<{ name: string }>)(idx), 3000, 'channels')) as { name: string }
        if (!ch.name) break
        out.push({ idx, name: ch.name })
      } catch {
        break
      }
    }
    return out.length ? out : [{ idx: 0, name: 'Public' }]
  }

  async sendDirect(publicKey: string, text: string): Promise<{ ack: number; timeoutMs: number }> {
    const r = (await withTimeout((this.c().sendTextMessage as (k: Uint8Array, t: string) => Promise<unknown>)(Buffer.from(publicKey, 'hex'), text), 10_000, 'sending')) as {
      expectedAckCrc: number
      estTimeout: number
    }
    return { ack: r.expectedAckCrc, timeoutMs: r.estTimeout }
  }

  async sendChannel(idx: number, text: string): Promise<void> {
    await withTimeout((this.c().sendChannelTextMessage as (i: number, t: string) => Promise<void>)(idx, text), 10_000, 'sending')
  }

  async nextMessage(): Promise<RawMessage | null> {
    const m = (await withTimeout((this.c().syncNextMessage as () => Promise<unknown>)(), 8000, 'collecting messages')) as {
      contactMessage?: { pubKeyPrefix: Uint8Array; text: string; senderTimestamp: number; pathLen: number; snr: number | null; txtType: number }
      channelMessage?: { channelIdx: number; text: string; senderTimestamp: number; pathLen: number; snr: number | null }
    } | null
    if (!m) return null
    const hops = (n: number) => (n === 0xff ? null : n)
    if (m.contactMessage) {
      const c = m.contactMessage
      return { kind: 'direct', fromPrefix: hex(c.pubKeyPrefix), text: c.text, sentAt: c.senderTimestamp * 1000, hops: hops(c.pathLen), snr: c.snr }
    }
    if (m.channelMessage) {
      const c = m.channelMessage
      return { kind: 'channel', idx: c.channelIdx, text: c.text, sentAt: c.senderTimestamp * 1000, hops: hops(c.pathLen), snr: c.snr }
    }
    // Channel data and other kinds aren't shown; skip to the next.
    return this.nextMessage()
  }

  async advert(): Promise<void> {
    await withTimeout((this.c().sendFloodAdvert as () => Promise<void>)(), 8000, 'advertising')
  }

  async setName(name: string): Promise<void> {
    await withTimeout((this.c().setAdvertName as (n: string) => Promise<void>)(name), 5000, 'renaming')
  }

  async setPosition(lat: number, lon: number): Promise<void> {
    await withTimeout((this.c().setAdvertLatLong as (a: number, b: number) => Promise<void>)(Math.round(lat * 1e6), Math.round(lon * 1e6)), 5000, 'setting the position')
  }
}

/**
 * A pretend radio with a few neighbours who answer back, for trying Messages
 * without hardware. Nothing is transmitted.
 */
export class DemoLink extends EventEmitter implements RadioLink {
  private queue: RawMessage[] = []
  private name = 'Outpost Demo'
  private pos: { lat: number | null; lon: number | null } = { lat: -27.4698, lon: 153.0251 }
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private ackSeq = 1000

  static readonly PEOPLE: RawContact[] = [
    { publicKey: 'a1'.repeat(32), name: 'Sam (next door)', type: 'chat', lat: -27.4712, lon: 153.0274, lastAdvert: null, pathLen: 0 },
    { publicKey: 'b2'.repeat(32), name: 'Mt Coot-tha Repeater', type: 'repeater', lat: -27.4846, lon: 152.9563, lastAdvert: null, pathLen: 0 },
    { publicKey: 'c3'.repeat(32), name: 'Jess', type: 'chat', lat: -27.4402, lon: 153.0617, lastAdvert: null, pathLen: 1 },
    { publicKey: 'd4'.repeat(32), name: 'Community Room', type: 'room', lat: -27.4975, lon: 153.0137, lastAdvert: null, pathLen: 1 },
  ]

  constructor(private readonly speed = 1) {
    super()
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms / this.speed)
    t.unref?.()
    this.timers.add(t)
  }

  private push(m: RawMessage) {
    this.queue.push(m)
    this.emit('messages')
  }

  async connect(): Promise<void> {
    this.later(1500, () => this.push({ kind: 'channel', idx: 0, text: 'Jess: Morning all, power back on in Paddington?', sentAt: Date.now(), hops: 1, snr: 6.5 }))
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    this.emit('disconnected')
  }

  async info(): Promise<RadioInfo> {
    return { name: this.name, publicKey: 'ee'.repeat(32), freq: 915.8, bandwidth: 250, sf: 10, cr: 5, txPower: 22, ...this.pos, batteryMv: 4020 }
  }

  async contacts(): Promise<RawContact[]> {
    const now = Date.now()
    return DemoLink.PEOPLE.map((p, i) => ({ ...p, lastAdvert: now - (i + 1) * 7 * 60_000 }))
  }

  async channels() {
    return [
      { idx: 0, name: 'Public' },
      { idx: 1, name: 'Family' },
    ]
  }

  async sendDirect(publicKey: string, text: string) {
    const ack = ++this.ackSeq
    const who = DemoLink.PEOPLE.find((p) => p.publicKey === publicKey)
    this.later(1200, () => this.emit('confirmed', ack, 1180))
    if (who && who.type === 'chat') {
      this.later(4000, () =>
        this.push({ kind: 'direct', fromPrefix: publicKey.slice(0, 12), text: reply(text), sentAt: Date.now(), hops: who.pathLen, snr: 4.25 }),
      )
    }
    return { ack, timeoutMs: 8000 }
  }

  async sendChannel(idx: number, text: string) {
    if (idx === 0 && /\?$/.test(text.trim())) {
      this.later(5000, () => this.push({ kind: 'channel', idx, text: 'Sam (next door): Not sure, I can ask around.', sentAt: Date.now(), hops: 0, snr: 9 }))
    }
  }

  async nextMessage() {
    return this.queue.shift() ?? null
  }

  async advert() {}

  async setName(name: string) {
    this.name = name
  }

  async setPosition(lat: number, lon: number) {
    this.pos = { lat, lon }
  }
}

function reply(text: string): string {
  if (/water|tank/i.test(text)) return 'Tank is about half full here, happy to share.'
  if (/power|electric/i.test(text)) return 'Still out on our street. Solar is keeping the fridge going.'
  if (/\?/.test(text)) return "Good question, I'll find out and let you know."
  return 'Got it, thanks!'
}
