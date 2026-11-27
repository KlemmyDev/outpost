import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ReadLink } from '#/features/library/ui/ReadLink'
import { GUIDES_BOOK, guide } from '#/features/library/guides/catalog'
import { CprCoach } from './CprCoach'
import { CallBar, useGuides } from './Page'
import { topic as findTopic, type Topic } from './topics'
import type { FirstAidData } from './types'

/** Related guides worth a link beside the main one. */
const ALSO: Record<string, string[]> = {
  'snake-bite': ['anzcor-pressure-bandage'],
  'spider-bite': ['anzcor-pressure-bandage'],
  cpr: ['anzcor-bls-flowchart'],
  anaphylaxis: ['anzcor-anaphylaxis-flowchart'],
  unconscious: ['anzcor-managing-emergency'],
}

/** Topics that say "start CPR" or "recovery position" link to them. */
function related(t: Topic): Topic[] {
  const ids = new Set<string>()
  const text = t.steps.join(' ')
  if (t.id !== 'cpr' && /CPR/.test(text)) ids.add('cpr')
  if (t.id !== 'unconscious' && /recovery position/i.test(text)) ids.add('unconscious')
  if (t.id !== 'anaphylaxis' && /anaphylaxis|allergic/i.test([...t.callWhen, ...t.steps].join(' '))) ids.add('anaphylaxis')
  if (t.id !== 'snake-bite' && /snake bite/i.test(text)) ids.add('snake-bite')
  return [...ids].map((id) => findTopic(id)!).filter(Boolean)
}

export function TopicPage({ t, initial }: { t: Topic; initial: FirstAidData }) {
  const [cpr, setCpr] = useState(false)
  const { data, busy, save } = useGuides(initial)
  const guides = [t.guide, ...(ALSO[t.id] ?? [])].filter((g): g is string => !!g)

  return (
    <main className="page aid-page aid-topic">
      <CallBar />
      <nav aria-label="Breadcrumb" className="reader-crumbs">
        <Link to="/first-aid">First aid</Link>
        <span aria-hidden="true">›</span>
        <span>{t.group}</span>
      </nav>
      <header className="aid-head">
        <h1>{t.title}</h1>
        <p className="lead">{t.summary}</p>
      </header>

      {t.always000 && (
        <a className="aid-always" href="tel:000">
          <strong>Call 000 now.</strong> Put the phone on speaker; they'll help while you do this.
        </a>
      )}

      {t.id === 'cpr' && (
        <button type="button" className="aid-cpr-btn" onClick={() => setCpr(true)}>
          <span className="aid-cpr-icon" aria-hidden="true">
            ♥
          </span>
          <span>
            <strong>Start the CPR beat</strong>
            <span>110 a minute, counted for you</span>
          </span>
        </button>
      )}

      <section className="card" aria-labelledby="steps">
        <h2 id="steps" className="visually-hidden">
          What to do
        </h2>
        <ol className="aid-steps">
          {t.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      {(t.callWhen.length > 0 || t.dont.length > 0) && (
        <div className="aid-two">
          {t.callWhen.length > 0 && (
            <section className="card aid-call-when" aria-labelledby="call-when">
              <h2 id="call-when">{t.always000 ? 'Tell 000' : 'Call 000 if'}</h2>
              <ul>
                {t.callWhen.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {t.dont.length > 0 && (
            <section className="card aid-dont" aria-labelledby="dont">
              <h2 id="dont">Don't</h2>
              <ul>
                {t.dont.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="card aid-sources" aria-labelledby="more">
        <h2 id="more">More detail</h2>
        {guides.map((id) => {
          const g = guide(id)
          if (!g) return null
          const saved = data.saved.includes(id)
          return (
            <div key={id} className="aid-source">
              <div>
                <strong>{g.title}</strong>
                <span className="muted">
                  {g.publisher}
                  {g.kind === 'pdf' ? ' · flowchart' : ' · full guideline'}
                </span>
              </div>
              {saved ? (
                <ReadLink book={GUIDES_BOOK} path={id} className="btn secondary">
                  Open
                </ReadLink>
              ) : (
                <button type="button" className="btn secondary" disabled={busy} onClick={save} title="Saves all the first aid guides from ANZCOR">
                  {busy ? 'Saving…' : 'Save to read offline'}
                </button>
              )}
            </div>
          )
        })}
        <div className="aid-source">
          <div>
            <strong>WikiMed</strong>
            <span className="muted">{data.wikimed ? `Search for “${t.more}”` : 'Not installed. Get it in Library › Sources.'}</span>
          </div>
          {data.wikimed ? (
            <Link to="/library/search" search={{ q: t.more, book: data.wikimed }} className="btn secondary">
              Search
            </Link>
          ) : (
            <Link to="/library/sources" className="btn secondary">
              Sources
            </Link>
          )}
        </div>
        {related(t).length > 0 && (
          <div className="aid-related">
            <span className="muted">See also:</span>
            {related(t).map((r) => (
              <Link key={r.id} to="/first-aid/$topic" params={{ topic: r.id }}>
                {r.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      {cpr && <CprCoach onClose={() => setCpr(false)} />}
    </main>
  )
}
