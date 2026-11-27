import type { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_DELIVERY,
  type DeliveryConfig,
  type Notification,
  type NotificationLevel,
  type NotifyInput,
} from '#/platform/notifications.types'
import type { SettingsStore } from './settings.server'

const CONFIG_KEY = 'notifications.delivery'
const KEEP = 500
const RANK: Record<NotificationLevel, number> = { info: 0, warn: 1, alert: 2 }
const NTFY_PRIORITY: Record<NotificationLevel, string> = { info: 'low', warn: 'default', alert: 'high' }
const NTFY_TAGS: Record<NotificationLevel, string> = { info: 'white_check_mark', warn: 'warning', alert: 'rotating_light' }

interface Row {
  id: number
  at: number
  feature: string
  level: NotificationLevel
  title: string
  body: string
  read_at: number | null
}

export function validUrl(value: string): boolean {
  if (!value) return true
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Notifications for the whole platform. Every one is kept in the app (the
 * bell in the header). Important ones can also go to ntfy, which works on a
 * phone and can run on your own network, and to a webhook. Delivery is best
 * effort: if the internet is down, the in-app copy is still there.
 */
export class NotificationService {
  lastDeliveryError: string | null = null

  constructor(
    private readonly db: DatabaseSync,
    private readonly settings: SettingsStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get delivery(): DeliveryConfig {
    return { ...DEFAULT_DELIVERY, ...(this.settings.getJson<Partial<DeliveryConfig>>(CONFIG_KEY) ?? {}) }
  }

  setDelivery(input: Partial<DeliveryConfig>): DeliveryConfig {
    const next = { ...this.delivery, ...input }
    next.ntfyUrl = next.ntfyUrl.trim()
    next.webhookUrl = next.webhookUrl.trim()
    if (!validUrl(next.ntfyUrl)) throw Object.assign(new Error('The ntfy address must start with http:// or https://'), { status: 400 })
    if (!validUrl(next.webhookUrl)) throw Object.assign(new Error('The webhook address must start with http:// or https://'), { status: 400 })
    if (!(next.minLevel in RANK)) next.minLevel = 'warn'
    this.settings.setJson(CONFIG_KEY, next)
    return next
  }

  /** Saves a notification and sends it on. Returns once it's saved; delivery carries on. */
  notify(input: NotifyInput): Notification {
    const at = Date.now()
    const r = this.db
      .prepare('INSERT INTO notifications (at, feature, level, title, body) VALUES (?, ?, ?, ?, ?)')
      .run(at, input.feature, input.level, input.title, input.body ?? '')
    this.db.prepare('DELETE FROM notifications WHERE id <= (SELECT max(id) FROM notifications) - ?').run(KEEP)
    const n: Notification = { id: Number(r.lastInsertRowid), at, feature: input.feature, level: input.level, title: input.title, body: input.body ?? '', read: false }
    if (RANK[n.level] >= RANK[this.delivery.minLevel]) void this.deliver(n)
    return n
  }

  list(limit = 50): Notification[] {
    return (this.db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit) as unknown as Row[]).map((r) => ({
      id: r.id,
      at: r.at,
      feature: r.feature,
      level: r.level,
      title: r.title,
      body: r.body,
      read: r.read_at !== null,
    }))
  }

  unreadCount(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM notifications WHERE read_at IS NULL').get() as { n: number }).n
  }

  markAllRead(): void {
    this.db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(Date.now())
  }

  /** Sends one notification to every configured channel. Errors are recorded, not thrown. */
  async deliver(n: Pick<Notification, 'level' | 'title' | 'body' | 'feature' | 'at'>): Promise<string[]> {
    const { ntfyUrl, webhookUrl } = this.delivery
    const errors: string[] = []
    const send = async (name: string, url: string, init: RequestInit) => {
      try {
        const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(8_000) })
        if (!res.ok) errors.push(`${name} answered ${res.status}`)
      } catch (err) {
        errors.push(`${name}: ${(err as Error).name === 'TimeoutError' ? 'no answer' : (err as Error).message}`)
      }
    }
    await Promise.all([
      ntfyUrl &&
        send('ntfy', ntfyUrl, {
          method: 'POST',
          body: n.body || n.title,
          headers: { Title: n.title, Priority: NTFY_PRIORITY[n.level], Tags: NTFY_TAGS[n.level] },
        }),
      webhookUrl &&
        send('Webhook', webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'outpost', feature: n.feature, level: n.level, title: n.title, body: n.body, at: new Date(n.at).toISOString() }),
        }),
    ])
    this.lastDeliveryError = errors.length ? errors.join('; ') : null
    if (errors.length) console.warn('[notifications] delivery failed:', this.lastDeliveryError)
    return errors
  }
}
