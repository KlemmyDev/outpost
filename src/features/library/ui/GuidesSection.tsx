import { useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { formatBytes } from '#/platform/ui/format'
import { GUIDE_TOPICS, GUIDES_BOOK, type GuideState, type GuidesData } from '../guides/catalog'
import { getGuides, refreshGuides, removeGuide, saveGuides } from '../library.functions'
import { ReadLink } from './ReadLink'

/**
 * Australian guides on the Sources screen: official first aid, emergency and
 * healthy eating documents, saved straight from each publisher. Small enough
 * that "Save all" is the obvious choice.
 */
export function GuidesSection() {
  const router = useRouter()
  const [data, setData] = useState<GuidesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => setData(await getGuides()), [])
  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load])

  const busy = data?.guides.some((g) => g.busy) ?? false
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void load().catch(() => {}), 1200)
    return () => {
      clearInterval(t)
      // Finished: the guides may now be a book on the shelf.
      void router.invalidate()
    }
  }, [busy, load, router])

  async function act(fn: () => Promise<GuidesData>) {
    setError(null)
    try {
      setData(await fn())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!data) return null
  const missing = data.guides.filter((g) => g.bytes === null)
  const missingBytes = missing.reduce((n, g) => n + g.approxBytes, 0)
  const failed = data.guides.filter((g) => g.error)

  return (
    <section className="card" aria-labelledby="au-title">
      <div className="card-head">
        <h2 id="au-title">Australian guides</h2>
        <span className="mono">
          {data.installed} OF {data.guides.length} SAVED{data.installed ? ` · ${formatBytes(data.installedBytes).toUpperCase()}` : ''}
        </span>
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        First aid from ANZCOR (the Australian Resuscitation Council), household emergency plans from Red Cross, fire services and Get Ready
        Queensland, and the Australian Dietary Guidelines. Their publishers allow saving copies for your own use, so each is downloaded straight
        from them to this server. Saved guides are checked for new versions monthly.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {missing.length > 0 && (
          <button type="button" className="btn accent" disabled={busy} onClick={() => act(() => saveGuides({ data: { ids: missing.map((g) => g.id) } }))}>
            {busy ? 'Saving…' : `Save ${missing.length === data.guides.length ? 'all' : `the other ${missing.length}`} (about ${formatBytes(missingBytes)})`}
          </button>
        )}
        {data.installed > 0 && (
          <>
            <ReadLink book={GUIDES_BOOK} path="" className="btn secondary">
              Open guides
            </ReadLink>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => act(() => refreshGuides())}>
              Check for new versions
            </button>
          </>
        )}
      </div>
      {error && <div className="notice bad">{error}</div>}
      {failed.length > 0 && !busy && (
        <div className="notice warn">
          {failed.length === 1 ? `${failed[0]!.title} couldn't be saved: ${failed[0]!.error}` : `${failed.length} guides couldn't be saved. ${failed[0]!.error}`}
        </div>
      )}
      <div className="guide-topics">
        {GUIDE_TOPICS.map((topic) => {
          const list = data.guides.filter((g) => g.topic === topic)
          const saved = list.filter((g) => g.bytes !== null).length
          const isOpen = open === topic
          return (
            <div key={topic} className="guide-topic">
              <button type="button" className="guide-topic-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : topic)}>
                <strong>{topic}</strong>
                <span className="muted">
                  {saved} of {list.length} saved
                </span>
                <span aria-hidden="true" className="chevron">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <div className="rows">
                  {list.map((g) => (
                    <GuideRow
                      key={g.id}
                      g={g}
                      onSave={() => act(() => saveGuides({ data: { ids: [g.id] } }))}
                      onRemove={() => act(() => removeGuide({ data: { id: g.id } }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GuideRow({ g, onSave, onRemove }: { g: GuideState; onSave: () => void; onRemove: () => void }) {
  return (
    <div className="row lib-installed">
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {g.bytes !== null ? (
          <ReadLink book={GUIDES_BOOK} path={g.id} className="lib-row-link grow">
            <strong>{g.title}</strong>
          </ReadLink>
        ) : (
          <strong>{g.title}</strong>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          {g.summary}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {g.publisher} · {g.kind === 'pdf' ? 'PDF' : 'Web page'} · {formatBytes(g.bytes ?? g.approxBytes)}
          {g.error ? ` · ${g.error}` : ''}
        </span>
      </span>
      <span className="dl-actions">
        <a className="tool-btn" href={g.url} target="_blank" rel="noopener noreferrer" aria-label={`${g.title} on the publisher's site`}>
          Source ↗
        </a>
        {g.busy ? (
          <span className="mono">SAVING…</span>
        ) : g.bytes !== null ? (
          <button type="button" className="tool-btn" onClick={onRemove}>
            Remove
          </button>
        ) : (
          <button type="button" className="tool-btn accent" onClick={onSave}>
            Save
          </button>
        )}
      </span>
    </div>
  )
}
