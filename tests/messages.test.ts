import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoLink, withTimeout, type RadioLink } from '#/features/messages/radio.server'
import { cleanRadioSettings, MessagesService } from '#/features/messages/server'
import { MessageStore, MIGRATIONS, splitSender } from '#/features/messages/store.server'
import type { RadioSettings } from '#/features/messages/types'
import { migrate, openDatabase } from '#/platform/server/db.server'
import { SettingsStore } from '#/platform/server/settings.server'
import type { NotifyInput } from '#/platform/notifications.types'

describe('message helpers', () => {
  it('splits the sender out of channel text', () => {
    expect(splitSender('Jess: power back on?')).toEqual({ name: 'Jess', text: 'power back on?' })
    expect(splitSender('no sender here')).toEqual({ name: '', text: 'no sender here' })
    expect(splitSender('Sam: time is 10:30')).toEqual({ name: 'Sam', text: 'time is 10:30' })
  })

  it('checks connection settings', () => {
    expect(cleanRadioSettings({ transport: 'tcp', tcpHost: '192.168.1.60', tcpPort: 5000 })).toMatchObject({ transport: 'tcp', tcpHost: '192.168.1.60' })
    expect(() => cleanRadioSettings({ transport: 'tcp', tcpHost: 'bad host!' })).toThrow(/address/)
    expect(() => cleanRadioSettings({ transport: 'serial', serialPath: 'COM3' })).toThrow(/device path/)
    expect(cleanRadioSettings({ transport: 'nonsense' as never }).transport).toBe('off')
  })

  it('gives up on a radio that never answers', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'test')).rejects.toThrow(/didn't answer/)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-msg-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

function setup(makeLink: (s: RadioSettings) => RadioLink = () => new DemoLink(200)) {
  const db = openDatabase(join(dir, 'o.db'))
  migrate(db, 'messages', MIGRATIONS)
  const settings = new SettingsStore(db)
  const sent: Omit<NotifyInput, 'feature'>[] = []
  const store = new MessageStore(db)
  const svc = new MessagesService(store, { db, settings, notify: (n) => void sent.push(n), log: () => {} }, makeLink)
  return { svc, store, sent }
}

const SAM = DemoLink.PEOPLE[0]!
const REPEATER = DemoLink.PEOPLE[1]!

describe('messages over a radio', () => {
  it('connects, mirrors contacts and channels, and collects waiting messages', async () => {
    const { svc, store } = setup()
    await svc.start()
    svc.saveSettings({ transport: 'demo' })
    await until(() => svc.radioStatus().state === 'connected')
    expect(svc.radioStatus().info).toMatchObject({ name: 'Outpost Demo', freq: 915.8 })
    expect(store.contacts().map((c) => c.name)).toContain(SAM.name)
    expect(store.channels().map((c) => c.name)).toEqual(['Public', 'Family'])
    // The demo posts on Public shortly after connecting.
    await until(() => store.thread('ch:0').length > 0)
    expect(store.thread('ch:0')[0]).toMatchObject({ senderName: 'Jess', outgoing: false })
    expect(svc.conversations().find((c) => c.id === 'ch:0')?.unread).toBe(1)
    svc.stop()
  })

  it('sends a direct message, marks it delivered on the receipt, and notifies on the reply', async () => {
    const { svc, store, sent } = setup()
    await svc.start()
    svc.saveSettings({ transport: 'demo' })
    await until(() => svc.radioStatus().state === 'connected')
    const conv = `dm:${SAM.publicKey}`
    const m = await svc.send(conv, '  Is the water tank full?  ')
    expect(m).toMatchObject({ outgoing: true, status: 'sent', text: 'Is the water tank full?' })
    await until(() => store.message(m.id)!.status === 'delivered')
    expect(store.message(m.id)!.roundTripMs).toBe(1180)
    await until(() => store.thread(conv).length === 2)
    expect(store.thread(conv)[1]).toMatchObject({ outgoing: false, senderName: SAM.name })
    expect(sent.some((n) => n.title === `Message from ${SAM.name}`)).toBe(true)
    svc.stop()
  })

  it("refuses what the radio can't carry, and replies to strangers", async () => {
    const { svc } = setup()
    await svc.start()
    svc.saveSettings({ transport: 'demo' })
    await until(() => svc.radioStatus().state === 'connected')
    await expect(svc.send('ch:0', 'x'.repeat(141))).rejects.toThrow(/too long/)
    await expect(svc.send('ch:0', '   ')).rejects.toThrow(/Type a message/)
    await expect(svc.send('dm:abcdef123456', 'hi')).rejects.toThrow(/contacts/)
    svc.stop()
  })

  it("can't send while the radio is away, but keeps what it has", async () => {
    const { svc, store } = setup()
    await svc.start()
    store.add({ conversation: 'ch:0', outgoing: false, senderName: 'Jess', text: 'earlier', sentAt: 1, receivedAt: 1, status: 'received', hops: 0, snr: null })
    await expect(svc.send('ch:0', 'hello')).rejects.toThrow(/isn’t connected/)
    expect(svc.conversations()[0]!.last?.text).toBe('earlier')
    svc.stop()
  })

  it('reports a radio it cannot reach and tries again', async () => {
    let tries = 0
    const failing = () => {
      tries++
      const l = new EventEmitter() as unknown as RadioLink
      Object.assign(l, { connect: async () => Promise.reject(new Error("Couldn't reach the radio: ECONNREFUSED")), close: () => {} })
      return l
    }
    const { svc } = setup(failing)
    await svc.start()
    svc.saveSettings({ transport: 'tcp', tcpHost: '10.0.0.9' })
    await until(() => svc.radioStatus().state === 'error')
    expect(svc.radioStatus().error).toMatch(/ECONNREFUSED/)
    expect(tries).toBe(1)
    svc.stop()
  })

  it('marks unanswered direct messages failed and sends them again', async () => {
    const { svc, store } = setup()
    await svc.start()
    svc.saveSettings({ transport: 'demo' })
    await until(() => svc.radioStatus().state === 'connected')
    const old = store.add({ conversation: `dm:${REPEATER.publicKey}`, outgoing: true, senderName: 'Me', text: 'ping', sentAt: 1, receivedAt: 1, status: 'sent', hops: null, snr: null, ack: 77 })
    expect(store.expireUnconfirmed(Date.now())).toBe(1)
    expect(store.message(old.id)!.status).toBe('failed')
    const again = await svc.retry(old.id)
    expect(again.status).toBe('sent')
    await until(() => store.message(old.id)!.status === 'delivered')
    svc.stop()
  })
})
