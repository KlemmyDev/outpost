import type { FeatureContext, FeatureServer } from '#/platform/server/runtime.server'
import { DemoLink, MeshCoreLink, type RadioLink, type RawMessage } from './radio.server'
import { channelId, directId, MessageStore, MIGRATIONS, splitSender } from './store.server'
import { DEFAULT_RADIO, MAX_TEXT, type Conversation, type Message, type MessagesData, type MessagesStatus, type RadioSettings, type RadioStatus, type Transport } from './types'

const SETTINGS_KEY = 'messages.radio'
const RETRY_MS = [5, 10, 30, 60].map((s) => s * 1000)
/** A direct message with no receipt after this long is marked failed. */
const RECEIPT_WAIT_MS = 90_000

export function cleanRadioSettings(input: Partial<RadioSettings>, base: RadioSettings = DEFAULT_RADIO): RadioSettings {
  const transport: Transport = (['off', 'serial', 'tcp', 'demo'] as const).includes(input.transport as Transport) ? (input.transport as Transport) : base.transport
  const port = Number(input.tcpPort ?? base.tcpPort)
  const host = String(input.tcpHost ?? base.tcpHost).trim()
  const path = String(input.serialPath ?? base.serialPath).trim()
  if (transport === 'tcp' && !/^[\w.-]+$/.test(host)) throw new Error("Enter the radio's address, like 192.168.1.60.")
  if (transport === 'serial' && !/^\/dev\/[\w./-]+$/.test(path)) throw new Error('Enter a device path like /dev/meshcore or /dev/ttyACM0.')
  if (transport === 'tcp' && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('The port must be a number between 1 and 65535.')
  return {
    transport,
    serialPath: path || DEFAULT_RADIO.serialPath,
    tcpHost: host,
    tcpPort: Number.isInteger(port) && port > 0 ? port : 5000,
    notifyDirect: typeof input.notifyDirect === 'boolean' ? input.notifyDirect : base.notifyDirect,
    notifyChannels: typeof input.notifyChannels === 'boolean' ? input.notifyChannels : base.notifyChannels,
  }
}

/**
 * Keeps a MeshCore companion radio connected, mirrors its contacts and
 * channels, and keeps every message in Outpost's database so everyone at home
 * can read and send from the browser. Reconnects by itself, and marks direct
 * messages delivered when the radio hears the receipt.
 */
export class MessagesService {
  private link: RadioLink | null = null
  private status: RadioStatus = { state: 'off', transport: 'off', error: null, info: null, connectedAt: null, lastHeardAt: null }
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private tick: ReturnType<typeof setInterval> | null = null
  private attempt = 0
  private draining = false
  private drainAgain = false
  private advertTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(
    readonly store: MessageStore,
    private readonly ctx: FeatureContext,
    private readonly makeLink: (s: RadioSettings) => RadioLink = defaultLink,
  ) {}

  settings(): RadioSettings {
    return cleanRadioSettings(this.ctx.settings.getJson<Partial<RadioSettings>>(SETTINGS_KEY) ?? {}, DEFAULT_RADIO)
  }

  saveSettings(input: Partial<RadioSettings>): RadioSettings {
    const next = cleanRadioSettings(input, this.settings())
    this.ctx.settings.setJson(SETTINGS_KEY, next)
    void this.restart()
    return next
  }

  async start(): Promise<void> {
    this.stopped = false
    this.tick = setInterval(() => void this.housekeeping(), 30_000)
    this.tick.unref?.()
    await this.restart()
  }

  stop(): void {
    this.stopped = true
    if (this.tick) clearInterval(this.tick)
    this.disconnect()
  }

  private disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    const link = this.link
    this.link = null
    link?.removeAllListeners()
    link?.close()
  }

  /** Drops any connection and connects again with the saved settings. */
  async restart(): Promise<void> {
    this.disconnect()
    this.attempt = 0
    const s = this.settings()
    this.status = { ...this.status, transport: s.transport, error: null, connectedAt: null }
    if (s.transport === 'off') {
      this.status.state = 'off'
      return
    }
    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const s = this.settings()
    this.status.state = 'connecting'
    const link = this.makeLink(s)
    this.link = link
    try {
      await link.connect()
      if (this.link !== link) return link.close()
      link.on('disconnected', () => this.lost(link, 'The radio disconnected.'))
      link.on('messages', () => void this.drain())
      link.on('adverts', () => this.contactsSoon())
      link.on('confirmed', (ack: number, rtt: number) => {
        this.status.lastHeardAt = Date.now()
        this.store.confirm(ack, rtt)
      })
      this.status.info = await link.info()
      this.status.state = 'connected'
      this.status.error = null
      this.status.connectedAt = Date.now()
      this.attempt = 0
      this.ctx.log(`radio connected: ${this.status.info.name} (${s.transport})`)
      this.store.saveChannels(await link.channels().catch(() => [{ idx: 0, name: 'Public' }]))
      await this.refreshContacts()
      await this.drain()
    } catch (err) {
      this.lost(link, (err as Error).message)
    }
  }

  private lost(link: RadioLink, message: string): void {
    if (this.link !== link || this.stopped) return
    this.link = null
    link.removeAllListeners()
    link.close()
    this.status.state = this.status.state === 'connected' ? 'disconnected' : 'error'
    this.status.error = message
    this.status.connectedAt = null
    const wait = RETRY_MS[Math.min(this.attempt++, RETRY_MS.length - 1)]!
    this.ctx.log(`radio: ${message} Trying again in ${wait / 1000} s.`)
    this.retryTimer = setTimeout(() => void this.connect(), wait)
    this.retryTimer.unref?.()
  }

  private contactsSoon(): void {
    if (this.advertTimer) return
    this.advertTimer = setTimeout(() => {
      this.advertTimer = null
      void this.refreshContacts().catch(() => {})
    }, 2000)
    this.advertTimer.unref?.()
  }

  private async refreshContacts(): Promise<void> {
    if (!this.link) return
    this.store.saveContacts(await this.link.contacts())
  }

  private async housekeeping(): Promise<void> {
    this.store.expireUnconfirmed(Date.now() - RECEIPT_WAIT_MS)
    if (this.status.state !== 'connected' || !this.link) return
    // Pushes can be missed; collect anything waiting, and refresh the battery.
    await this.drain()
    try {
      this.status.info = await this.link.info()
    } catch {
      // Keep the last reading.
    }
  }

  /** Collects every waiting message from the radio, one at a time. */
  async drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true
      return
    }
    this.draining = true
    try {
      do {
        this.drainAgain = false
        for (let i = 0; i < 200 && this.link; i++) {
          const m = await this.link.nextMessage()
          if (!m) break
          await this.receive(m)
        }
      } while (this.drainAgain && this.link)
    } catch (err) {
      this.ctx.log('radio: collecting messages failed:', (err as Error).message)
    } finally {
      this.draining = false
    }
  }

  private async receive(m: RawMessage): Promise<void> {
    const now = Date.now()
    this.status.lastHeardAt = now
    const s = this.settings()
    if (m.kind === 'direct') {
      let contact = this.store.contactByPrefix(m.fromPrefix)
      if (!contact) {
        await this.refreshContacts().catch(() => {})
        contact = this.store.contactByPrefix(m.fromPrefix)
      }
      const name = contact?.name ?? `Unknown ${m.fromPrefix.slice(0, 6)}`
      const msg = this.store.add({ conversation: directId(contact?.publicKey ?? m.fromPrefix), outgoing: false, senderName: name, text: m.text, sentAt: m.sentAt || now, receivedAt: now, status: 'received', hops: m.hops, snr: m.snr })
      if (s.notifyDirect) this.ctx.notify({ level: 'info', title: `Message from ${name}`, body: msg.text })
    } else {
      const { name, text } = splitSender(m.text)
      const channel = this.store.channels().find((c) => c.idx === m.idx)?.name ?? `Channel ${m.idx}`
      this.store.add({ conversation: channelId(m.idx), outgoing: false, senderName: name || 'Someone', text, sentAt: m.sentAt || now, receivedAt: now, status: 'received', hops: m.hops, snr: m.snr })
      if (s.notifyChannels) this.ctx.notify({ level: 'info', title: `${name || 'Someone'} on ${channel}`, body: text })
    }
  }

  private linkOrThrow(): RadioLink {
    if (!this.link || this.status.state !== 'connected') throw new Error('The radio isn’t connected. Messages can be read, but not sent, until it is.')
    return this.link
  }

  async send(conversation: string, text: string): Promise<Message> {
    const body = text.replace(/\s+$/g, '').replace(/^\s+/, '')
    if (!body) throw new Error('Type a message first.')
    if (Buffer.byteLength(body) > MAX_TEXT) throw new Error(`That's too long for the radio: keep it under ${MAX_TEXT} characters.`)
    const link = this.linkOrThrow()
    const me = this.status.info?.name ?? 'Me'
    const now = Date.now()
    const ch = /^ch:(\d+)$/.exec(conversation)
    if (ch) {
      const msg = this.store.add({ conversation, outgoing: true, senderName: me, text: body, sentAt: now, receivedAt: now, status: 'sending', hops: null, snr: null })
      try {
        await link.sendChannel(Number(ch[1]), body)
        this.store.setStatus(msg.id, 'sent')
      } catch (err) {
        this.store.setStatus(msg.id, 'failed')
        throw err
      }
      return this.store.message(msg.id)!
    }
    const dm = /^dm:([0-9a-f]{64})$/.exec(conversation)
    if (!dm) throw new Error("That conversation can't be replied to: the sender isn't in the radio's contacts yet.")
    const msg = this.store.add({ conversation, outgoing: true, senderName: me, text: body, sentAt: now, receivedAt: now, status: 'sending', hops: null, snr: null })
    await this.sendDirect(msg.id, dm[1]!, body)
    return this.store.message(msg.id)!
  }

  private async sendDirect(id: number, publicKey: string, text: string): Promise<void> {
    try {
      const { ack } = await this.linkOrThrow().sendDirect(publicKey, text)
      this.store.setStatus(id, 'sent', { ack })
    } catch (err) {
      this.store.setStatus(id, 'failed')
      throw err
    }
  }

  async retry(id: number): Promise<Message> {
    const msg = this.store.message(id)
    if (!msg || !msg.outgoing || msg.status !== 'failed') throw new Error('Only failed messages can be sent again.')
    const dm = /^dm:([0-9a-f]{64})$/.exec(msg.conversation)
    const ch = /^ch:(\d+)$/.exec(msg.conversation)
    this.store.setStatus(id, 'sending', { ack: null })
    if (dm) await this.sendDirect(id, dm[1]!, msg.text)
    else if (ch) {
      try {
        await this.linkOrThrow().sendChannel(Number(ch[1]), msg.text)
        this.store.setStatus(id, 'sent')
      } catch (err) {
        this.store.setStatus(id, 'failed')
        throw err
      }
    }
    return this.store.message(id)!
  }

  async advert(): Promise<void> {
    await this.linkOrThrow().advert()
  }

  async rename(name: string): Promise<void> {
    const clean = name.trim().slice(0, 31)
    if (!clean) throw new Error('Give the radio a name.')
    await this.linkOrThrow().setName(clean)
    this.status.info = await this.linkOrThrow().info()
  }

  async setPosition(pos: { lat: number; lon: number } | null): Promise<void> {
    await this.linkOrThrow().setPosition(pos?.lat ?? 0, pos?.lon ?? 0)
    this.status.info = await this.linkOrThrow().info()
  }

  radioStatus(): RadioStatus {
    return { ...this.status }
  }

  conversations(): Conversation[] {
    const sums = this.store.summaries()
    const contacts = this.store.contacts()
    const channels = this.store.channels()
    const list: Conversation[] = (channels.length ? channels : [{ idx: 0, name: 'Public' }]).map((c) => {
      const s = sums.get(channelId(c.idx))
      return { id: channelId(c.idx), kind: 'channel', title: c.name, subtitle: c.idx === 0 ? 'Everyone in range' : 'Channel', last: s?.last ?? null, unread: s?.unread ?? 0 }
    })
    const seen = new Set(list.map((c) => c.id))
    for (const [id, s] of sums) {
      if (seen.has(id) || !id.startsWith('dm:')) continue
      const key = id.slice(3)
      const contact = contacts.find((c) => c.publicKey === key) ?? null
      list.push({ id, kind: 'direct', title: contact?.name ?? s.last.senderName, subtitle: contact ? contactLine(contact.type, contact.pathLen) : 'Not in contacts', last: s.last, unread: s.unread })
      seen.add(id)
    }
    // Channels first, then direct conversations by most recent.
    return list.sort((a, b) => Number(b.kind === 'channel') - Number(a.kind === 'channel') || (b.last?.id ?? 0) - (a.last?.id ?? 0))
  }

  data(): MessagesData {
    return { status: this.radioStatus(), settings: this.settings(), conversations: this.conversations(), contacts: this.store.contacts() }
  }

  widget(): MessagesStatus {
    const last = this.store.latestIncoming()
    return {
      state: this.status.state,
      transport: this.status.transport,
      radioName: this.status.info?.name ?? null,
      unread: this.store.unread(),
      contacts: this.store.contacts().length,
      last: last ? { from: last.senderName, text: last.text, at: last.receivedAt } : null,
    }
  }
}

export function contactLine(type: string, pathLen: number): string {
  const kind = type === 'repeater' ? 'Repeater' : type === 'room' ? 'Room server' : type === 'sensor' ? 'Sensor' : 'Radio'
  return `${kind} · ${pathLen < 0 ? 'route unknown' : pathLen === 0 ? 'direct' : `${pathLen} hop${pathLen === 1 ? '' : 's'}`}`
}

function defaultLink(s: RadioSettings): RadioLink {
  if (s.transport === 'demo') return new DemoLink()
  if (s.transport === 'tcp') return new MeshCoreLink({ transport: 'tcp', host: s.tcpHost, port: s.tcpPort })
  return new MeshCoreLink({ transport: 'serial', path: s.serialPath })
}

let service: MessagesService | null = null

export function getMessages(): MessagesService | null {
  return service
}

export const server: FeatureServer = {
  migrations: MIGRATIONS,
  async start(ctx) {
    service = new MessagesService(new MessageStore(ctx.db), ctx)
    // Connecting can take a while; don't hold up the rest of the server.
    void service.start()
  },
  stop() {
    service?.stop()
    service = null
  },
}
