import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Sheet } from '#/platform/ui/Sheet'
import { readHref, readingTime } from './format'
import { encodePathForUrl } from './paths'
import { randomArticle, setBookmark } from './library.functions'
import type { ArticleResult, TocItem } from './types'

type Article = Extract<ArticleResult, { kind: 'article' }>

export type ReaderTheme = 'paper' | 'sepia' | 'night'
export type ReaderFont = 'serif' | 'sans'
export interface ReaderPrefs {
  theme: ReaderTheme
  size: number
  font: ReaderFont
}

const SIZES = [15, 17, 19, 21, 24]
const DEFAULT_PREFS: ReaderPrefs = { theme: 'paper', size: 1, font: 'serif' }
const PREFS_KEY = 'outpost.reader'

function loadPrefs(): ReaderPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ReaderPrefs>
    return {
      theme: p.theme === 'sepia' || p.theme === 'night' ? p.theme : 'paper',
      size: typeof p.size === 'number' && p.size >= 0 && p.size < SIZES.length ? p.size : 1,
      font: p.font === 'sans' ? 'sans' : 'serif',
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function usePrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS)
  // Before paint, so a night reader doesn't flash white on every article.
  useIsomorphicLayoutEffect(() => setPrefs(loadPrefs()), [])
  const update = (p: Partial<ReaderPrefs>) =>
    setPrefs((old) => {
      const next = { ...old, ...p }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        // Private windows can refuse storage; the setting still applies for now.
      }
      return next
    })
  return [prefs, update] as const
}

/**
 * The reader: one article, cleaned up and set in Outpost's type, with a table
 * of contents, reading themes and text sizes, and saving for later. Links to
 * other articles stay inside the reader.
 */
export function Reader({ article }: { article: Article }) {
  const navigate = useNavigate()
  const [prefs, setPrefs] = usePrefs()
  const [saved, setSaved] = useState(article.saved)
  const [showPrefs, setShowPrefs] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const progress = useRef<HTMLDivElement>(null)

  useEffect(() => setSaved(article.saved), [article])

  // Jump to the heading in the address, or to the top for a new article.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))
    const target = hash ? document.getElementById(hash) : null
    if (target) target.scrollIntoView()
    else window.scrollTo({ top: 0 })
  }, [article.contentId, article.path])

  // Reading progress, and which section is on screen for the contents.
  useEffect(() => {
    const el = body.current
    if (!el) return
    const onScroll = () => {
      const rect = el.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const f = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1
      if (progress.current) progress.current.style.transform = `scaleX(${f})`
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const headings = article.toc.map((t) => document.getElementById(t.id)).filter((h): h is HTMLElement => !!h)
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setCurrent(visible[0].target.id)
      },
      { rootMargin: '-90px 0px -65% 0px' },
    )
    headings.forEach((h) => io.observe(h))
    return () => {
      window.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
  }, [article])

  // Article links open in the reader without reloading the page.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a')
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('/library/read/')) {
      e.preventDefault()
      void navigate({ href })
    } else if (href.startsWith('#')) {
      e.preventDefault()
      const target = document.getElementById(decodeURIComponent(href.slice(1)))
      if (target) {
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        history.replaceState(history.state, '', href)
      }
    }
  }

  async function toggleSave() {
    const next = !saved
    setSaved(next)
    try {
      await setBookmark({ data: { book: article.contentId, path: article.path, title: article.title, bookTitle: article.bookTitle, saved: next } })
    } catch {
      setSaved(!next)
    }
  }

  async function random() {
    setBusy(true)
    try {
      const r = await randomArticle({ data: { book: article.contentId } })
      if (r) await navigate({ href: readHref(r.book, r.path) })
    } finally {
      setBusy(false)
    }
  }

  const original = `/api/library/raw/${encodeURIComponent(article.contentId)}/${encodePathForUrl(article.path)}`

  return (
    <div className="reader" data-theme={prefs.theme} data-font={prefs.font} style={{ ['--reader-size' as string]: `${SIZES[prefs.size]}px` }}>
      <div className="reader-progress" aria-hidden="true">
        <div ref={progress} />
      </div>
      <div className="reader-bar">
        <nav aria-label="Breadcrumb" className="reader-crumbs">
          <Link to="/library">Library</Link>
          <span aria-hidden="true">›</span>
          <Link to="/library/read/$book/$" params={{ book: article.contentId, _splat: '' }}>
            {article.bookTitle}
          </Link>
        </nav>
        <div className="reader-tools">
          {article.toc.length > 2 && (
            <button type="button" className="tool-btn toc-btn" onClick={() => setShowToc(true)}>
              Contents
            </button>
          )}
          <button type="button" className="tool-btn" onClick={random} disabled={busy}>
            {busy ? '…' : 'Random'}
          </button>
          <div className="prefs-wrap">
            <button type="button" className="tool-btn" aria-expanded={showPrefs} aria-haspopup="dialog" onClick={() => setShowPrefs((s) => !s)} aria-label="Text and theme">
              <span aria-hidden="true" style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>
                Aa
              </span>
            </button>
            {showPrefs && <PrefsPanel prefs={prefs} onChange={setPrefs} onClose={() => setShowPrefs(false)} />}
          </div>
          <button type="button" className={`tool-btn save-btn${saved ? ' on' : ''}`} aria-pressed={saved} onClick={toggleSave}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="reader-layout">
        {article.toc.length > 2 && (
          <aside className="reader-toc" aria-label="Contents">
            <span className="mono">CONTENTS</span>
            <Toc toc={article.toc} current={current} />
          </aside>
        )}
        <article className="reader-article" lang="en">
          <header className="reader-head">
            <span className="mono">{article.bookTitle.toUpperCase()}</span>
            <h1>{article.title}</h1>
            <span className="muted reader-meta">
              {readingTime(article.words)} ·{' '}
              <a href={original} target="_blank" rel="noopener">
                Original layout
              </a>
            </span>
          </header>
          {/* Cleaned on the server (article.server.ts): no scripts, styles or event handlers survive. */}
          <div ref={body} className="article-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: article.html }} />
        </article>
      </div>

      {showToc && (
        <Sheet title="Contents" onClose={() => setShowToc(false)}>
          <Toc
            toc={article.toc}
            current={current}
            onPick={(id) => {
              setShowToc(false)
              setTimeout(() => document.getElementById(id)?.scrollIntoView(), 240)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

function Toc({ toc, current, onPick }: { toc: TocItem[]; current: string | null; onPick?: (id: string) => void }) {
  return (
    <ol className="toc">
      {toc.map((t) => (
        <li key={t.id} className={`lvl${t.level}${current === t.id ? ' on' : ''}`}>
          <a
            href={`#${encodeURIComponent(t.id)}`}
            aria-current={current === t.id ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault()
              if (onPick) onPick(t.id)
              else document.getElementById(t.id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              history.replaceState(history.state, '', `#${encodeURIComponent(t.id)}`)
            }}
          >
            {t.text}
          </a>
        </li>
      ))}
    </ol>
  )
}

function PrefsPanel({ prefs, onChange, onClose }: { prefs: ReaderPrefs; onChange: (p: Partial<ReaderPrefs>) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const wrap = panel.current?.parentElement
      if (wrap && !wrap.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])
  return (
    <div ref={panel} className="prefs-panel" role="dialog" aria-label="Text and theme">
      <span className="mono">THEME</span>
      <div className="theme-swatches" role="group" aria-label="Theme">
        {(['paper', 'sepia', 'night'] as const).map((t) => (
          <button key={t} type="button" className={`swatch-btn ${t}`} aria-pressed={prefs.theme === t} onClick={() => onChange({ theme: t })}>
            {t === 'paper' ? 'Paper' : t === 'sepia' ? 'Sepia' : 'Night'}
          </button>
        ))}
      </div>
      <span className="mono">TEXT SIZE</span>
      <div className="size-row">
        <button type="button" className="tool-btn" aria-label="Smaller text" disabled={prefs.size === 0} onClick={() => onChange({ size: prefs.size - 1 })}>
          A−
        </button>
        <span className="size-dots" aria-label={`Size ${prefs.size + 1} of ${SIZES.length}`}>
          {SIZES.map((_, i) => (
            <span key={i} className={i <= prefs.size ? 'on' : ''} />
          ))}
        </span>
        <button type="button" className="tool-btn" aria-label="Larger text" disabled={prefs.size === SIZES.length - 1} onClick={() => onChange({ size: prefs.size + 1 })}>
          A+
        </button>
      </div>
      <span className="mono">TYPE</span>
      <div className="segmented" role="group" aria-label="Typeface">
        <button type="button" aria-pressed={prefs.font === 'serif'} onClick={() => onChange({ font: 'serif' })}>
          Serif
        </button>
        <button type="button" aria-pressed={prefs.font === 'sans'} onClick={() => onChange({ font: 'sans' })}>
          Sans
        </button>
      </div>
    </div>
  )
}
