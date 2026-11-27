import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Sheet } from '#/platform/ui/Sheet'
import { ago } from '#/features/library/format'
import { getThread, pollMessages, retryMessage, sendAdvert, sendMessage } from './messages.functions'
import { RadioSettingsPanel } from './ui/RadioSettingsPanel'
import { SetupCard } from './ui/SetupCard'
import { MAX_TEXT, type Contact, type Conversation, type Message, type MessagesData, type RadioStatus } from './types'

export function batteryPercent(mv: number | null): number | null {
  if (mv === null) return null
  return Math.max(0, Math.min(100, Math.round(((mv - 3300) / (4200 - 3300)) * 100)))
}

const STATE_WORDS: Record<RadioStatus['state'], string> = {
  off: 'Off',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Reconnecting…',
  error: "Can't reach the radio",
}

const STATE_COLOR: Record<RadioStatus['state'], string> = {
  off: 'var(--muted-dot)',
  connecting: 'var(--ochre)',
  connected: 'var(--eucalypt)',
  disconnected: 'var(--ochre)',
  error: 'var(--flare)',
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  const y = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Messages: a chat app over the MeshCore radio. Conversations on the left
 * (channels first, then people), the open thread on the right; on phones,
 * one at a time. Refreshes every few seconds while open.
 */
export function MessagesPage({ initial, open }: { initial: MessagesData; open: string | null }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(initial.status)
  const [settings, setSettings] = useState(initial.settings)
  const [conversations, setConversations] = useState(initial.conversations)
  const [contacts, setContacts] = useState(initial.contacts)
  const [tab, setTab] = useState<'chats' | 'radios'>('chats')
  const [thread, setThread] = useState<Message[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const active = conversations.find((c) => c.id === open) ?? (open?.startsWith('dm:') ? directStub(open, contacts) : null)

  const go = useCallback((id: string | null) => void navigate({ to: '/messages', search: id ? { c: id } : {}, replace: !!id && !!open }), [navigate, open])

  // Load the thread when the conversation changes.
  useEffect(() => {
    if (!open) return setThread([])
    let cancelled = false
    getThread({ data: { conversation: open } }).then((list) => !cancelled && setThread(list))
    return () => {
      cancelled = true
    }
  }, [open])

  // Refresh: status, the list, new messages and receipts for the open thread.
  const threadRef = useRef(thread)
  threadRef.current = thread
  useEffect(() => {
    if (settings.transport === 'off') return
    const t = setInterval(async () => {
      try {
        const cur = threadRef.current
        const r = await pollMessages({
          data: {
            conversation: open ?? undefined,
            after: cur.at(-1)?.id ?? 0,
            watch: cur.filter((m) => m.outgoing && (m.status === 'sending' || m.status === 'sent')).map((m) => m.id),
          },
        })
        setStatus(r.status)
        setConversations(r.conversations)
        setContacts(r.contacts)
        if (r.fresh.length || r.changed.length) {
          setThread((list) => {
            const byId = new Map(list.map((m) => [m.id, m]))
            for (const m of [...r.changed, ...r.fresh]) byId.set(m.id, m)
            return [...byId.values()].sort((a, b) => a.id - b.id)
          })
        }
      } catch {
        // Next tick.
      }
    }, 2500)
    return () => clearInterval(t)
  }, [open, settings.transport])

  async function advert() {
    setNotice(null)
    try {
      await sendAdvert()
      setNotice('Announced. Radios in range will add you to their contacts.')
    } catch (err) {
      setNotice((err as Error).message)
    }
  }

  if (settings.transport === 'off') {
    return (
      <main className="page">
        <SetupCard
          onSaved={(s, st) => {
            setSettings(s)
            setStatus(st)
          }}
        />
      </main>
    )
  }

  const battery = batteryPercent(status.info?.batteryMv ?? null)

  return (
    <main className={`msg-page${open ? ' has-thread' : ''}`}>
      <header className="msg-top">
        <div className="msg-top-title">
          <span className="eyebrow">COMMS · MESHCORE{settings.transport === 'demo' ? ' · DEMO RADIO' : ''}</span>
          <h1>Messages</h1>
        </div>
        <button type="button" className="radio-pill" onClick={() => setShowSettings(true)} aria-label={`Radio: ${STATE_WORDS[status.state]}. Open radio settings.`}>
          <span className="dot" style={{ background: STATE_COLOR[status.state] }} aria-hidden="true" />
          <span className="radio-pill-text">
            <strong>{status.info?.name ?? 'Radio'}</strong>
            <span className="muted">
              {STATE_WORDS[status.state]}
              {status.state === 'connected' && status.info ? ` · ${status.info.freq} MHz` : ''}
              {battery !== null && status.state === 'connected' ? ` · ${battery}%` : ''}
            </span>
          </span>
        </button>
        <button type="button" className="tool-btn" onClick={advert} disabled={status.state !== 'connected'} title="Let radios in range know you're here">
          Announce
        </button>
      </header>
      {notice && (
        <div className="notice good msg-notice" role="status">
          {notice}
        </div>
      )}
      {status.state === 'error' && status.error && (
        <div className="notice warn msg-notice">
          {status.error} Messages you've received are still here; new ones arrive once it reconnects.{' '}
          <button type="button" className="link-btn" onClick={() => setShowSettings(true)}>
            Check the radio settings
          </button>
        </div>
      )}

      <div className="msg-body">
        <aside className="msg-list" aria-label="Conversations">
          <div className="segmented msg-tabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={tab === 'chats'} onClick={() => setTab('chats')}>
              Chats
            </button>
            <button type="button" aria-pressed={tab === 'radios'} onClick={() => setTab('radios')}>
              Radios · {contacts.length}
            </button>
          </div>
          {tab === 'chats' ? (
            <ul className="msg-convs">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button type="button" className={c.id === open ? 'on' : ''} aria-current={c.id === open ? 'true' : undefined} onClick={() => go(c.id)}>
                    <span className={`msg-avatar ${c.kind}`} aria-hidden="true">
                      {c.kind === 'channel' ? '#' : initials(c.title)}
                    </span>
                    <span className="msg-conv-text">
                      <span className="msg-conv-top">
                        <strong>{c.title}</strong>
                        {c.last && <span className="muted">{ago(c.last.receivedAt)}</span>}
                      </span>
                      <span className="msg-conv-last">
                        {c.last ? `${c.last.outgoing ? 'You: ' : c.kind === 'channel' ? `${c.last.senderName}: ` : ''}${c.last.text}` : c.subtitle}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="msg-unread" aria-label={`${c.unread} unread`}>
                        {c.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <RadioList contacts={contacts} onMessage={(c) => go(`dm:${c.publicKey}`)} />
          )}
        </aside>

        <section className="msg-thread" aria-label={active ? `Conversation: ${active.title}` : 'Conversation'}>
          {active ? (
            <Thread
              key={active.id}
              conversation={active}
              messages={thread}
              canSend={status.state === 'connected'}
              onBack={() => go(null)}
              onSent={(m) => setThread((list) => [...list.filter((x) => x.id !== m.id), m].sort((a, b) => a.id - b.id))}
            />
          ) : (
            <div className="msg-empty">
              <span className="msg-empty-icon" aria-hidden="true">
                ⌁
              </span>
              <p>Pick a channel or a person. Public reaches every MeshCore radio in range, through any repeaters.</p>
            </div>
          )}
        </section>
      </div>

      {showSettings && (
        <Sheet title="Radio" onClose={() => setShowSettings(false)}>
          <RadioSettingsPanel
            settings={settings}
            status={status}
            onChange={(s, st) => {
              setSettings(s)
              setStatus(st)
            }}
          />
        </Sheet>
      )}
    </main>
  )
}

function directStub(id: string, contacts: Contact[]): Conversation | null {
  const c = contacts.find((x) => `dm:${x.publicKey}` === id)
  return c ? { id, kind: 'direct', title: c.name, subtitle: 'No messages yet', last: null, unread: 0 } : null
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => [...w][0]!.toUpperCase())
      .join('') || '?'
  )
}

const TYPE_WORDS: Record<Contact['type'], string> = { chat: 'Person', repeater: 'Repeater', room: 'Room server', sensor: 'Sensor', unknown: 'Radio' }

function RadioList({ contacts, onMessage }: { contacts: Contact[]; onMessage: (c: Contact) => void }) {
  if (!contacts.length) {
    return (
      <p className="muted msg-radios-empty">
        No radios heard yet. They appear as they announce themselves; press Announce so they hear you too.
      </p>
    )
  }
  return (
    <ul className="msg-radios">
      {contacts.map((c) => (
        <li key={c.publicKey}>
          <span className={`msg-avatar ${c.type === 'chat' ? 'direct' : 'node'}`} aria-hidden="true">
            {c.type === 'repeater' ? 'R' : c.type === 'room' ? '▣' : initials(c.name)}
          </span>
          <span className="msg-conv-text">
            <strong>{c.name}</strong>
            <span className="muted">
              {TYPE_WORDS[c.type]} · {c.pathLen < 0 ? 'route unknown' : c.pathLen === 0 ? 'heard directly' : `${c.pathLen} hop${c.pathLen === 1 ? '' : 's'} away`}
              {c.lastAdvert ? ` · ${ago(c.lastAdvert)}` : ''}
              {c.lat !== null ? ' · on the map' : ''}
            </span>
          </span>
          {c.type === 'chat' && (
            <button type="button" className="tool-btn" onClick={() => onMessage(c)}>
              Message
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

const STATUS_WORDS: Record<Message['status'], string> = { sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', failed: 'Not delivered', received: '' }

function Thread({ conversation, messages, canSend, onBack, onSent }: { conversation: Conversation; messages: Message[]; canSend: boolean; onBack: () => void; onSent: (m: Message) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const bytes = new TextEncoder().encode(text.trim()).length
  const isDirect = conversation.kind === 'direct'
  const canReply = !isDirect || /^dm:[0-9a-f]{64}$/.test(conversation.id)

  // Stay pinned to the newest message.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function send() {
    if (!text.trim() || bytes > MAX_TEXT || busy) return
    setBusy(true)
    setError(null)
    try {
      const m = await sendMessage({ data: { conversation: conversation.id, text } })
      onSent(m)
      setText('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function retry(m: Message) {
    try {
      onSent(await retryMessage({ data: { id: m.id } }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  let lastDay = ''
  return (
    <>
      <div className="msg-thread-head">
        <button type="button" className="tool-btn msg-back" onClick={onBack} aria-label="Back to conversations">
          ‹
        </button>
        <span className={`msg-avatar ${conversation.kind}`} aria-hidden="true">
          {conversation.kind === 'channel' ? '#' : initials(conversation.title)}
        </span>
        <span className="msg-conv-text">
          <strong>{conversation.title}</strong>
          <span className="muted">{conversation.kind === 'channel' ? `${conversation.subtitle} · not private` : `${conversation.subtitle} · encrypted end to end`}</span>
        </span>
      </div>
      <div className="msg-scroll" ref={scroller} aria-live="polite">
        {messages.length === 0 && (
          <p className="msg-first">
            {conversation.kind === 'channel'
              ? `Nothing on ${conversation.title} yet. Messages here reach every radio on this channel.`
              : `No messages with ${conversation.title} yet. Say hello.`}
          </p>
        )}
        {messages.map((m, i) => {
          const day = dayLabel(m.receivedAt)
          const showDay = day !== lastDay
          lastDay = day
          const prev = messages[i - 1]
          const grouped = prev && prev.outgoing === m.outgoing && prev.senderName === m.senderName && m.receivedAt - prev.receivedAt < 5 * 60_000 && !showDay
          return (
            <div key={m.id}>
              {showDay && <div className="msg-day">{day}</div>}
              <div className={`msg-bubble-row ${m.outgoing ? 'out' : 'in'}${grouped ? ' grouped' : ''}`}>
                <div className={`msg-bubble${m.status === 'failed' ? ' failed' : ''}`}>
                  {!m.outgoing && conversation.kind === 'channel' && !grouped && <span className="msg-sender">{m.senderName}</span>}
                  <span className="msg-text">{m.text}</span>
                  <span className="msg-meta">
                    {clock(m.receivedAt)}
                    {m.outgoing && m.status !== 'received' && (
                      <>
                        {' · '}
                        {STATUS_WORDS[m.status]}
                        {m.status === 'delivered' && m.roundTripMs ? ` in ${(m.roundTripMs / 1000).toFixed(1)} s` : ''}
                      </>
                    )}
                    {!m.outgoing && m.hops !== null && ` · ${m.hops === 0 ? 'direct' : `${m.hops} hop${m.hops === 1 ? '' : 's'}`}`}
                    {!m.outgoing && m.snr !== null && ` · SNR ${m.snr}`}
                  </span>
                  {m.status === 'failed' && (
                    <button type="button" className="link-btn msg-retry" onClick={() => retry(m)}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <form
        className="msg-compose"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        {error && <div className="notice bad">{error}</div>}
        {!canReply ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            This sender isn't in the radio's contacts yet, so you can't reply until they announce themselves.
          </p>
        ) : (
          <div className="msg-compose-row">
            <textarea
              rows={1}
              value={text}
              placeholder={canSend ? `Message ${conversation.title}` : 'The radio isn’t connected'}
              disabled={!canSend}
              aria-label={`Message ${conversation.title}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <span className={`msg-count${bytes > MAX_TEXT ? ' over' : ''}`} aria-live="polite">
              {MAX_TEXT - bytes}
            </span>
            <button type="submit" className="btn accent" disabled={!canSend || busy || !text.trim() || bytes > MAX_TEXT}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </form>
    </>
  )
}
