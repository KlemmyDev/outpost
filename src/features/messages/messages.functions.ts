import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { getMap } from '#/features/map/server'
import { getMessages } from './server'
import type { Contact, Conversation, Message, MessagesData, RadioSettings, RadioStatus } from './types'

async function svc() {
  if (!getPlatform().features.isEnabled('messages')) throw new Error('Messages is switched off.')
  let s = getMessages()
  if (!s) {
    await getPlatform().runtime.settled()
    s = getMessages()
  }
  if (!s) throw new Error('Messages is still starting. Try again in a moment.')
  return s
}

const conv = (v: unknown) => (typeof v === 'string' && /^(ch:\d{1,3}|dm:[0-9a-f]{12,64})$/.test(v) ? v : '')

export const getMessagesData = createServerFn({ method: 'GET' }).handler(async (): Promise<MessagesData> => (await svc()).data())

export const getThread = createServerFn({ method: 'GET' })
  .validator((d: { conversation: string }) => ({ conversation: conv(d?.conversation) }))
  .handler(async ({ data }): Promise<Message[]> => {
    const s = await svc()
    if (!data.conversation) return []
    s.store.markRead(data.conversation)
    return s.store.thread(data.conversation)
  })

/** The Messages page's refresh: radio status, the conversation list, and what's new in the open thread. */
export const pollMessages = createServerFn({ method: 'POST' })
  .validator((d: { conversation?: string; after?: number; watch?: number[] }) => ({
    conversation: conv(d?.conversation),
    after: typeof d?.after === 'number' ? Math.max(0, Math.floor(d.after)) : 0,
    watch: Array.isArray(d?.watch) ? d.watch.filter((n): n is number => Number.isInteger(n)).slice(-100) : [],
  }))
  .handler(async ({ data }): Promise<{ status: RadioStatus; conversations: Conversation[]; contacts: Contact[]; fresh: Message[]; changed: Message[] }> => {
    const s = await svc()
    let fresh: Message[] = []
    let changed: Message[] = []
    if (data.conversation) {
      fresh = s.store.thread(data.conversation, { after: data.after })
      changed = s.store.changedSince(data.conversation, data.watch)
      if (fresh.length) s.store.markRead(data.conversation)
    }
    return { status: s.radioStatus(), conversations: s.conversations(), contacts: s.store.contacts(), fresh, changed }
  })

export const sendMessage = createServerFn({ method: 'POST' })
  .validator((d: { conversation: string; text: string }) => ({ conversation: conv(d?.conversation), text: typeof d?.text === 'string' ? d.text.slice(0, 1000) : '' }))
  .handler(async ({ data }): Promise<Message> => (await svc()).send(data.conversation, data.text))

export const retryMessage = createServerFn({ method: 'POST' })
  .validator((d: { id: number }) => ({ id: Number.isInteger(d?.id) ? d.id : 0 }))
  .handler(async ({ data }): Promise<Message> => (await svc()).retry(data.id))

export const sendAdvert = createServerFn({ method: 'POST' }).handler(async () => {
  await (await svc()).advert()
  return { ok: true }
})

export const renameRadio = createServerFn({ method: 'POST' })
  .validator((d: { name: string }) => ({ name: typeof d?.name === 'string' ? d.name : '' }))
  .handler(async ({ data }) => {
    const s = await svc()
    await s.rename(data.name)
    return s.radioStatus()
  })

/** Shares Home from the Map as the radio's position in its adverts, or stops sharing. */
export const shareHome = createServerFn({ method: 'POST' })
  .validator((d: { share: boolean }) => ({ share: d?.share === true }))
  .handler(async ({ data }) => {
    const s = await svc()
    if (!data.share) await s.setPosition(null)
    else {
      const home = getMap()?.store.waypoints().find((w) => w.kind === 'home')
      if (!home) throw new Error('Set a Home waypoint on the Map first.')
      // Rounded to about 1 km: enough for others to see the area, not the house.
      await s.setPosition({ lat: Math.round(home.lat * 100) / 100, lon: Math.round(home.lon * 100) / 100 })
    }
    return s.radioStatus()
  })

export const saveRadioSettings = createServerFn({ method: 'POST' })
  .validator((d: Partial<RadioSettings>) => d ?? {})
  .handler(async ({ data }) => {
    const s = await svc()
    return { settings: s.saveSettings(data), status: s.radioStatus() }
  })

export const reconnectRadio = createServerFn({ method: 'POST' }).handler(async () => {
  const s = await svc()
  await s.restart()
  return s.radioStatus()
})

/** Serial ports the server can see, to help pick the radio. */
export const listSerialPorts = createServerFn({ method: 'GET' }).handler(async (): Promise<{ path: string; label: string }[]> => {
  await svc()
  try {
    const { SerialPort } = (await import('serialport')) as { SerialPort: { list(): Promise<{ path: string; manufacturer?: string; friendlyName?: string }[]> } }
    const ports = await SerialPort.list()
    return ports.filter((p) => /tty(ACM|USB)|meshcore|usbmodem|usbserial/i.test(p.path)).map((p) => ({ path: p.path, label: p.friendlyName ?? p.manufacturer ?? p.path }))
  } catch {
    return []
  }
})
