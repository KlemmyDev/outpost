import { Link } from '@tanstack/react-router'
import { SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'
import { ago } from '#/features/library/format'

const WORDS = { off: 'No radio', connecting: 'Connecting', connected: 'On air', disconnected: 'Reconnecting', error: 'Radio offline' } as const

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data.messages
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone={s?.state === 'error' ? 'flare' : 'eucalypt'}
        value={!s ? '—' : s.unread > 0 ? `${s.unread} new` : WORDS[s.state]}
        caption={
          !s
            ? "Couldn't read Messages."
            : s.state === 'off'
              ? 'Connect a MeshCore radio to message off-grid.'
              : s.last
                ? `${s.last.from}: ${s.last.text}`
                : `${s.radioName ?? 'Radio'} · ${s.contacts} radio${s.contacts === 1 ? '' : 's'} heard`
        }
        footer={s?.last ? `Last message ${ago(s.last.at)}${s.transport === 'demo' ? ' · demo radio' : ''}` : 'Texts over LoRa, no internet needed'}
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data.messages
    return (
      <>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {s?.state === 'connected'
            ? `${s.radioName} is on air with ${s.contacts} radio${s.contacts === 1 ? '' : 's'} heard. ${s.unread ? `${s.unread} message${s.unread === 1 ? '' : 's'} unread.` : 'Nothing unread.'}`
            : s?.state === 'off' || !s
              ? 'A MeshCore radio plugged into the server lets everyone at home text over LoRa, with no phone network or internet.'
              : "The radio isn't connected right now. Outpost keeps trying, and received messages are kept."}
        </p>
        <Link to="/messages" className="btn accent" style={{ alignSelf: 'flex-start' }}>
          Open Messages
        </Link>
      </>
    )
  },
}
