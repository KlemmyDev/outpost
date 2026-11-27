/** Shared between the server and the UI. */
export type NotificationLevel = 'info' | 'warn' | 'alert'

export interface Notification {
  id: number
  at: number
  feature: string
  level: NotificationLevel
  title: string
  body: string
  read: boolean
}

export interface NotifyInput {
  feature: string
  level: NotificationLevel
  title: string
  body?: string
}

export interface DeliveryConfig {
  /** An ntfy topic URL, e.g. https://ntfy.sh/my-outpost or http://ntfy.lan/outpost. */
  ntfyUrl: string
  /** Any URL that accepts a JSON POST. */
  webhookUrl: string
  /** The least important level that's sent out. In-app always gets everything. */
  minLevel: NotificationLevel
}

export const DEFAULT_DELIVERY: DeliveryConfig = { ntfyUrl: '', webhookUrl: '', minLevel: 'warn' }
