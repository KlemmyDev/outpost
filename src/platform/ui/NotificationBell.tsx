import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listNotifications, markNotificationsRead } from '#/platform/notifications.functions'
import type { Notification } from '#/platform/notifications.types'
import { Sheet } from './Sheet'

const LEVEL = {
  alert: { color: 'var(--flare)', word: 'Alert' },
  warn: { color: 'var(--ochre)', word: 'Warning' },
  info: { color: 'var(--eucalypt)', word: 'Update' },
} as const

function when(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  return new Date(at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The bell in the header: unread count, and the list in a slide-in panel. */
export function NotificationBell({ unread }: { unread: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)

  // Check for new ones every minute, so the count is right without a reload.
  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), 60_000)
    return () => clearInterval(t)
  }, [router])

  async function show() {
    setOpen(true)
    const r = await listNotifications()
    setItems(r.items)
    if (r.unread > 0) {
      await markNotificationsRead()
      void router.invalidate()
    }
  }

  return (
    <>
      <button type="button" className="pill bell" onClick={show} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <Sheet title="Notifications" onClose={() => setOpen(false)}>
          {items === null ? (
            <p className="muted">Loading…</p>
          ) : items.length === 0 ? (
            <div className="notice good">Nothing yet. Outpost will tell you here when something needs your attention.</div>
          ) : (
            <div className="rows">
              {items.map((n) => (
                <div key={n.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="dot" style={{ background: LEVEL[n.level].color, marginTop: 6 }} aria-hidden="true" />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong style={{ fontWeight: n.read ? 500 : 700 }}>
                        <span className="visually-hidden">{LEVEL[n.level].word}: </span>
                        {n.title}
                      </strong>
                      <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {when(n.at)}
                      </span>
                    </span>
                    {n.body && (
                      <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
                        {n.body}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
