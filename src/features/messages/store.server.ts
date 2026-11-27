import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '#/platform/server/db.server'
import type { RawContact } from './radio.server'
import type { Channel, Contact, Message, MessageStatus, NodeType } from './types'

/** The Messages feature's own tables, migrated in the "messages" namespace. */
export const MIGRATIONS: Migration[] = [
  `CREATE TABLE msg_contacts (
     public_key  TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     type        TEXT NOT NULL,
     lat         REAL,
     lon         REAL,
     last_advert INTEGER,
     path_len    INTEGER NOT NULL DEFAULT -1,
     updated_at  INTEGER NOT NULL
   )`,
  `CREATE TABLE msg_channels (
     idx  INTEGER PRIMARY KEY,
     name TEXT NOT NULL
   )`,
  `CREATE TABLE msg_messages (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation TEXT NOT NULL,
     outgoing     INTEGER NOT NULL,
     sender_name  TEXT NOT NULL,
     text         TEXT NOT NULL,
     sent_at      INTEGER NOT NULL,
     received_at  INTEGER NOT NULL,
     status       TEXT NOT NULL,
     hops         INTEGER,
     snr          REAL,
     ack          INTEGER,
     round_trip   INTEGER,
     read         INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX msg_messages_conv ON msg_messages (conversation, id)`,
]

interface ContactRow {
  public_key: string
  name: string
  type: string
  lat: number | null
  lon: number | null
  last_advert: number | null
  path_len: number
  updated_at: number
}
interface MessageRow {
  id: number
  conversation: string
  outgoing: number
  sender_name: string
  text: string
  sent_at: number
  received_at: number
  status: MessageStatus
  hops: number | null
  snr: number | null
  ack: number | null
  round_trip: number | null
  read: number
}

const toContact = (r: ContactRow): Contact => ({
  publicKey: r.public_key,
  name: r.name,
  type: r.type as NodeType,
  lat: r.lat,
  lon: r.lon,
  lastAdvert: r.last_advert,
  updatedAt: r.updated_at,
  pathLen: r.path_len,
})

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversation: r.conversation,
  outgoing: r.outgoing === 1,
  senderName: r.sender_name,
  text: r.text,
  sentAt: r.sent_at,
  receivedAt: r.received_at,
  status: r.status,
  hops: r.hops,
  snr: r.snr,
  roundTripMs: r.round_trip,
})

export const channelId = (idx: number) => `ch:${idx}`
export const directId = (publicKey: string) => `dm:${publicKey}`

/**
 * Channel messages carry their sender in the text, as "Name: message".
 * Splits that, or gives an empty name when there isn't one.
 */
export function splitSender(text: string): { name: string; text: string } {
  const m = /^([^:\n]{1,32}):\s(.*)$/s.exec(text)
  return m ? { name: m[1]!.trim(), text: m[2]! } : { name: '', text }
}

export class MessageStore {
  constructor(private readonly db: DatabaseSync) {}

  // Contacts and channels mirror what's on the radio.

  saveContacts(list: RawContact[]): void {
    const now = Date.now()
    const up = this.db.prepare(
      `INSERT INTO msg_contacts (public_key, name, type, lat, lon, last_advert, path_len, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (public_key) DO UPDATE SET name = excluded.name, type = excluded.type, lat = excluded.lat, lon = excluded.lon,
         last_advert = excluded.last_advert, path_len = excluded.path_len,
         updated_at = CASE WHEN msg_contacts.last_advert IS excluded.last_advert THEN msg_contacts.updated_at ELSE excluded.updated_at END`,
    )
    this.db.exec('BEGIN')
    try {
      for (const c of list) up.run(c.publicKey, c.name, c.type, c.lat, c.lon, c.lastAdvert, c.pathLen, now)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  contacts(): Contact[] {
    return (this.db.prepare('SELECT * FROM msg_contacts ORDER BY COALESCE(last_advert, 0) DESC').all() as unknown as ContactRow[]).map(toContact)
  }

  contact(publicKey: string): Contact | null {
    const r = this.db.prepare('SELECT * FROM msg_contacts WHERE public_key = ?').get(publicKey) as unknown as ContactRow | undefined
    return r ? toContact(r) : null
  }

  /** Incoming direct messages only name the first 6 bytes of the sender's key. */
  contactByPrefix(prefix: string): Contact | null {
    const r = this.db.prepare('SELECT * FROM msg_contacts WHERE public_key LIKE ? LIMIT 1').get(`${prefix.replace(/[^0-9a-f]/g, '')}%`) as unknown as ContactRow | undefined
    return r ? toContact(r) : null
  }

  saveChannels(list: Channel[]): void {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM msg_channels').run()
      const ins = this.db.prepare('INSERT INTO msg_channels (idx, name) VALUES (?, ?)')
      for (const c of list) ins.run(c.idx, c.name)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  channels(): Channel[] {
    return this.db.prepare('SELECT idx, name FROM msg_channels ORDER BY idx').all() as unknown as Channel[]
  }

  // Messages

  add(m: Omit<Message, 'id' | 'roundTripMs'> & { ack?: number | null; read?: boolean }): Message {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO msg_messages (conversation, outgoing, sender_name, text, sent_at, received_at, status, hops, snr, ack, read)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(m.conversation, m.outgoing ? 1 : 0, m.senderName, m.text, m.sentAt, m.receivedAt, m.status, m.hops, m.snr, m.ack ?? null, m.read || m.outgoing ? 1 : 0)
    return this.message(Number(lastInsertRowid))!
  }

  message(id: number): Message | null {
    const r = this.db.prepare('SELECT * FROM msg_messages WHERE id = ?').get(id) as unknown as MessageRow | undefined
    return r ? toMessage(r) : null
  }

  setStatus(id: number, status: MessageStatus, extra: { ack?: number | null } = {}): void {
    if (extra.ack !== undefined) this.db.prepare('UPDATE msg_messages SET status = ?, ack = ? WHERE id = ?').run(status, extra.ack, id)
    else this.db.prepare('UPDATE msg_messages SET status = ? WHERE id = ?').run(status, id)
  }

  /** A delivery receipt: marks the message with that ack code delivered. */
  confirm(ack: number, roundTripMs: number): Message | null {
    const r = this.db.prepare(`SELECT id FROM msg_messages WHERE ack = ? AND outgoing = 1 AND status IN ('sent', 'failed') ORDER BY id DESC LIMIT 1`).get(ack) as { id: number } | undefined
    if (!r) return null
    this.db.prepare(`UPDATE msg_messages SET status = 'delivered', round_trip = ? WHERE id = ?`).run(roundTripMs, r.id)
    return this.message(r.id)
  }

  /** Sent direct messages with no receipt by now are marked failed. */
  expireUnconfirmed(olderThan: number): number {
    return Number(this.db.prepare(`UPDATE msg_messages SET status = 'failed' WHERE outgoing = 1 AND status = 'sent' AND ack IS NOT NULL AND received_at < ?`).run(olderThan).changes)
  }

  /** A conversation's messages, oldest first: the latest `limit`, or those after an id. */
  thread(conversation: string, opts: { after?: number; limit?: number } = {}): Message[] {
    if (opts.after !== undefined) {
      return (this.db.prepare('SELECT * FROM msg_messages WHERE conversation = ? AND id > ? ORDER BY id').all(conversation, opts.after) as unknown as MessageRow[]).map(toMessage)
    }
    const rows = this.db.prepare('SELECT * FROM msg_messages WHERE conversation = ? ORDER BY id DESC LIMIT ?').all(conversation, opts.limit ?? 200) as unknown as MessageRow[]
    return rows.reverse().map(toMessage)
  }

  /** Every message whose status may have changed since: for the open thread's refresh. */
  changedSince(conversation: string, ids: number[]): Message[] {
    if (!ids.length) return []
    const list = ids.slice(-100)
    return (this.db.prepare(`SELECT * FROM msg_messages WHERE conversation = ? AND id IN (${list.map(() => '?').join(',')})`).all(conversation, ...list) as unknown as MessageRow[]).map(toMessage)
  }

  markRead(conversation: string): void {
    this.db.prepare('UPDATE msg_messages SET read = 1 WHERE conversation = ? AND read = 0').run(conversation)
  }

  summaries(): Map<string, { last: Message; unread: number }> {
    const rows = this.db
      .prepare(
        `SELECT m.*, (SELECT COUNT(*) FROM msg_messages u WHERE u.conversation = m.conversation AND u.read = 0) AS unread
         FROM msg_messages m JOIN (SELECT conversation, MAX(id) AS id FROM msg_messages GROUP BY conversation) l ON l.id = m.id`,
      )
      .all() as unknown as (MessageRow & { unread: number })[]
    return new Map(rows.map((r) => [r.conversation, { last: toMessage(r), unread: r.unread }]))
  }

  unread(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM msg_messages WHERE read = 0').get() as { n: number }).n
  }

  latestIncoming(): Message | null {
    const r = this.db.prepare('SELECT * FROM msg_messages WHERE outgoing = 0 ORDER BY id DESC LIMIT 1').get() as unknown as MessageRow | undefined
    return r ? toMessage(r) : null
  }
}
