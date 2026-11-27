import { createServerFn } from '@tanstack/react-start'
import type { DeliveryConfig } from './notifications.types'
import { getPlatform } from './server/platform.server'

export const listNotifications = createServerFn({ method: 'GET' }).handler(async () => {
  const { notifications } = getPlatform()
  return { items: notifications.list(50), unread: notifications.unreadCount() }
})

export const markNotificationsRead = createServerFn({ method: 'POST' }).handler(async () => {
  getPlatform().notifications.markAllRead()
  return { ok: true }
})

export const getDelivery = createServerFn({ method: 'GET' }).handler(async () => {
  const { notifications } = getPlatform()
  return { config: notifications.delivery, lastError: notifications.lastDeliveryError }
})

export const saveDelivery = createServerFn({ method: 'POST' })
  .validator((data: Partial<DeliveryConfig>) => data)
  .handler(async ({ data }) => ({ config: getPlatform().notifications.setDelivery(data) }))

/** Sends a test straight to ntfy and the webhook, and reports what came back. */
export const sendTestNotification = createServerFn({ method: 'POST' }).handler(async () => {
  const { notifications } = getPlatform()
  const errors = await notifications.deliver({
    feature: 'settings',
    level: 'warn',
    title: 'Outpost test notification',
    body: 'If you can read this, Outpost can reach you.',
    at: Date.now(),
  })
  return { errors }
})
