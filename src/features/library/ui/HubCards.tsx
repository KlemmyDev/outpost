import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Preview, Topic, TopicIcon as IconName, TopicSummary } from '../hub'
import { ReadLink } from './ReadLink'

/** Soft tints for covers without a picture, picked by book so each collection keeps its colour. */
const COVERS = [
  ['#e9efe9', '#4e9a7a'],
  ['#f3e7dc', '#c2652a'],
  ['#e3ebf3', '#2f6fae'],
  ['#ecebe6', '#5f6660'],
  ['#efe9f0', '#7a5a86'],
] as const

function hash(s: string): number {
  return [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
}

/** A page's picture, or a typographic cover in its book's colour when it has none (or it fails to load). */
export function Cover({ p, className = '' }: { p: Preview; className?: string }) {
  const [broken, setBroken] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setBroken(true)
  }, [])
  if (p.image && !broken) {
    return (
      // The Australian guides' pictures are charts and diagrams: shown whole, not cropped.
      <span className={`hub-cover${p.contentId === 'au-guides' ? ' fit' : ''} ${className}`}>
        <img ref={img} src={p.image} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </span>
    )
  }
  const [bg, ink] = COVERS[hash(p.contentId) % COVERS.length]!
  return (
    <span className={`hub-cover plain ${className}`} style={{ background: bg, color: ink }} aria-hidden="true">
      <span className="hub-cover-letter">{p.title.trim().charAt(0).toUpperCase() || '·'}</span>
      {p.pdf && <span className="hub-cover-book">PDF</span>}
    </span>
  )
}

/** A card for a page from any book: picture, title, opening lines and where it's from. */
export function PreviewCard({ p, size = 'md' }: { p: Preview; size?: 'lg' | 'md' | 'sm' }) {
  return (
    <ReadLink book={p.contentId} path={p.path} className={`hub-card ${size}`}>
      <Cover p={p} />
      <span className="hub-card-body">
        <span className="hub-card-book">{p.bookTitle}</span>
        <strong>{p.title}</strong>
        {size !== 'sm' && p.excerpt && <span className="hub-card-excerpt">{p.excerpt}</span>}
      </span>
    </ReadLink>
  )
}

export function CardSkeleton({ size = 'md' }: { size?: 'lg' | 'md' | 'sm' }) {
  return (
    <div className={`hub-card ${size} skeleton`} aria-hidden="true">
      <span className="hub-cover" />
      <span className="hub-card-body">
        <span className="sk-line short" />
        <span className="sk-line" />
        <span className="sk-line" />
      </span>
    </div>
  )
}

/** Simple line icons for the topics, drawn in the current colour. */
export function TopicIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    cross: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
    pot: (
      <>
        <path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
        <path d="M2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2" />
      </>
    ),
    drop: <path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11z" />,
    flame: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1 2-2 3-3 3 0-2-1-3-1-4-3 3-4 7-4 11a6 6 0 0 0 6 6z" />,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    leaf: (
      <>
        <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" />
        <path d="M5 19 13 11" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4M12 17v.5" />
      </>
    ),
    book: (
      <>
        <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 21V5M8 7h7" />
      </>
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** A topic on the hub: icon, name, a strip of pictures from its reading list and how much there is. */
export function TopicTile({ t, s }: { t: Topic; s: TopicSummary | null }) {
  const empty = s !== null && s.count === 0
  return (
    <Link to="/library/topic/$topic" params={{ topic: t.id }} className={`hub-topic t-${t.id}${empty ? ' empty' : ''}`}>
      <span className="hub-topic-pics" aria-hidden="true">
        {s?.images.length ? s.images.map((src) => <TilePic key={src} src={src} />) : <span className="hub-topic-glyph"><TopicIcon name={t.icon} size={34} /></span>}
      </span>
      <span className="hub-topic-text">
        <span className="hub-topic-name">
          <TopicIcon name={t.icon} size={18} />
          <strong>{t.title}</strong>
        </span>
        <span className="muted">{t.blurb}</span>
        <span className="hub-topic-count">{s === null ? 'Gathering…' : s.count === 0 ? 'Nothing on the shelves yet' : `${s.count} ${s.count === 1 ? 'read' : 'reads'}`}</span>
      </span>
    </Link>
  )
}

function TilePic({ src }: { src: string }) {
  const [ok, setOk] = useState(true)
  return ok ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setOk(false)} /> : null
}
