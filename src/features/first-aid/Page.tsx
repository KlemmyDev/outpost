import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ReadLink } from '#/features/library/ui/ReadLink'
import { GUIDES_BOOK } from '#/features/library/guides/catalog'
import { CprCoach } from './CprCoach'
import { getFirstAid, saveFirstAidGuides } from './first-aid.functions'
import { searchTopics, TOPIC_GROUPS, TOPICS, type Topic } from './topics'
import type { FirstAidData } from './types'

/** Numbers for the top of every First aid page. Tappable on phones. */
export function CallBar() {
  return (
    <div className="aid-call" role="region" aria-label="Emergency numbers">
      <a className="aid-000" href="tel:000">
        <span className="aid-000-n">000</span>
        <span>Ambulance, fire, police</span>
      </a>
      <a className="aid-num" href="tel:131126">
        <strong>13 11 26</strong>
        <span>Poisons Information</span>
      </a>
      <a className="aid-num" href="tel:1800022222">
        <strong>1800 022 222</strong>
        <span>healthdirect nurse</span>
      </a>
    </div>
  )
}

/** Saving the ANZCOR guides the topics link to, while the internet's up. */
export function useGuides(initial: FirstAidData) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const busy = data.saving.length > 0
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void getFirstAid().then(setData).catch(() => {}), 1500)
    return () => clearInterval(t)
  }, [busy])
  async function save() {
    setData(await saveFirstAidGuides())
    void router.invalidate()
  }
  return { data, busy, save }
}

export function FirstAidPage({ initial }: { initial: FirstAidData }) {
  const [q, setQ] = useState('')
  const [cpr, setCpr] = useState(false)
  const { data, busy, save } = useGuides(initial)
  const results = q.trim() ? searchTopics(q) : null
  const missing = data.total - data.saved.length

  return (
    <main className="page aid-page">
      <CallBar />

      <header className="aid-head">
        <span className="eyebrow">AID STATION · AUSTRALIAN FIRST AID</span>
        <h1>First aid</h1>
        <p className="lead">Short steps for when it's happening, from Australia's resuscitation guidelines. If in doubt, call 000: they'll talk you through it.</p>
      </header>

      <button type="button" className="aid-cpr-btn" onClick={() => setCpr(true)}>
        <span className="aid-cpr-icon" aria-hidden="true">
          ♥
        </span>
        <span>
          <strong>Not breathing? Start CPR</strong>
          <span>A beat to follow, 30 compressions then 2 breaths</span>
        </span>
      </button>

      <div className="aid-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: snake, burn, asthma, choking…" aria-label="Search first aid" />
      </div>

      {results ? (
        <section aria-label="Results">
          {results.length === 0 ? (
            <p className="muted">
              Nothing matches “{q.trim()}”.{' '}
              {data.wikimed ? (
                <Link to="/library/search" search={{ q: q.trim(), book: data.wikimed }}>
                  Search WikiMed
                </Link>
              ) : (
                <Link to="/library/search" search={{ q: q.trim() }}>
                  Search the library
                </Link>
              )}
            </p>
          ) : (
            <div className="aid-grid">
              {results.map((t) => (
                <TopicCard key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>
      ) : (
        TOPIC_GROUPS.map((g) => (
          <section key={g} className="aid-group" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`}>{g}</h2>
            <div className="aid-grid">
              {TOPICS.filter((t) => t.group === g).map((t) => (
                <TopicCard key={t.id} t={t} />
              ))}
            </div>
          </section>
        ))
      )}

      <section className="card aid-sources" aria-labelledby="aid-src">
        <h2 id="aid-src">The full guides</h2>
        <div className="aid-source">
          <div>
            <strong>ANZCOR guidelines</strong>
            <span className="muted">
              {missing === 0
                ? `All ${data.total} saved on this server.`
                : busy
                  ? `Saving… ${data.saved.length} of ${data.total}.`
                  : `${data.saved.length} of ${data.total} saved. Save them while the internet's up, so each topic links to the full guideline.`}
            </span>
          </div>
          {missing === 0 ? (
            <ReadLink book={GUIDES_BOOK} path="" className="btn secondary">
              Open
            </ReadLink>
          ) : (
            <button type="button" className="btn accent" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save the guides (about 15 MB)'}
            </button>
          )}
        </div>
        <div className="aid-source">
          <div>
            <strong>WikiMed</strong>
            <span className="muted">{data.wikimed ? 'Installed: each topic links to more in WikiMed.' : 'The medical encyclopedia, about 2 GB with pictures. Get it in Library › Sources.'}</span>
          </div>
          {data.wikimed ? (
            <ReadLink book={data.wikimed} path="" className="btn secondary">
              Open
            </ReadLink>
          ) : (
            <Link to="/library/sources" className="btn secondary">
              Sources
            </Link>
          )}
        </div>
        <p className="muted aid-small">
          These steps are a reminder, not training. A first aid course (St John, Red Cross, Royal Life Saving) is the best preparation. Written for Outpost from the
          ANZCOR guidelines, the National Asthma Council and ASCIA.
        </p>
      </section>

      {cpr && <CprCoach onClose={() => setCpr(false)} />}
    </main>
  )
}

function TopicCard({ t }: { t: Topic }) {
  return (
    <Link to="/first-aid/$topic" params={{ topic: t.id }} className="aid-card">
      <span className="aid-card-top">
        <strong>{t.title}</strong>
        {t.always000 && <span className="aid-badge">000</span>}
      </span>
      <span className="muted">{t.summary}</span>
    </Link>
  )
}
