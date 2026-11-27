/** Shared between the Messages server side and its page. No Node imports. */

export type Transport = 'off' | 'serial' | 'tcp' | 'demo'

export interface RadioSettings {
  transport: Transport
  /** Serial port inside the container. docker-compose maps your radio to /dev/meshcore. */
  serialPath: string
  tcpHost: string
  tcpPort: number
  /** Send a notification for direct messages. */
  notifyDirect: boolean
  /** And for channel messages. */
  notifyChannels: boolean
}

export const DEFAULT_RADIO: RadioSettings = {
  transport: 'off',
  serialPath: '/dev/meshcore',
  tcpHost: '',
  tcpPort: 5000,
  notifyDirect: true,
  notifyChannels: false,
}

export type RadioState = 'off' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface RadioInfo {
  name: string
  publicKey: string
  /** MHz */
  freq: number
  /** kHz */
  bandwidth: number
  sf: number
  cr: number
  txPower: number
  lat: number | null
  lon: number | null
  batteryMv: number | null
}

export interface RadioStatus {
  state: RadioState
  transport: Transport
  error: string | null
  info: RadioInfo | null
  connectedAt: number | null
  lastHeardAt: number | null
}

export type NodeType = 'chat' | 'repeater' | 'room' | 'sensor' | 'unknown'

/** A radio this one knows about, from its adverts. */
export interface Contact {
  publicKey: string
  name: string
  type: NodeType
  lat: number | null
  lon: number | null
  /** When it last advertised, by its own clock. */
  lastAdvert: number | null
  /** When Outpost last saw it update. */
  updatedAt: number
  /** Hops on the known route, -1 when it's reached by flooding. */
  pathLen: number
}

export interface Channel {
  idx: number
  name: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'received'

export interface Message {
  id: number
  /** `ch:<idx>` or `dm:<public key>` */
  conversation: string
  outgoing: boolean
  senderName: string
  text: string
  /** When it was sent, by the sender's clock. */
  sentAt: number
  receivedAt: number
  status: MessageStatus
  /** Hops it took, when known. */
  hops: number | null
  snr: number | null
  roundTripMs: number | null
}

export interface Conversation {
  id: string
  kind: 'channel' | 'direct'
  title: string
  subtitle: string
  last: Message | null
  unread: number
}

export interface MessagesData {
  status: RadioStatus
  settings: RadioSettings
  conversations: Conversation[]
  contacts: Contact[]
}

/** The Messages card on the Overview. */
export interface MessagesStatus {
  state: RadioState
  transport: Transport
  radioName: string | null
  unread: number
  contacts: number
  last: { from: string; text: string; at: number } | null
}

/** MeshCore text messages are limited by the radio packet; keep well inside it. */
export const MAX_TEXT = 140
