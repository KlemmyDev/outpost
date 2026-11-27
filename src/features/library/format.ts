import { encodePathForUrl } from './paths'

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Mar". */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 2 * 86400) return 'yesterday'
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' })
}

/** "Oct 2026" from "2026-10" or "2026-10-31". */
export function monthYear(date: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(date)
  if (!m) return date
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

export function count(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} million`
  return n.toLocaleString('en-AU')
}

/** Minutes to read at about 230 words a minute. */
export function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / 230))
  return `${min} min read`
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 90) return 'under 2 min'
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min`
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60 / 5) * 5
    return `about ${h} h${m ? ` ${m} min` : ''}`
  }
  return `about ${Math.round(seconds / 86400)} days`
}

/** The reader's address for a page in a book. */
export function readHref(contentId: string, path: string): string {
  return `/library/read/${encodeURIComponent(contentId)}/${encodePathForUrl(path)}`
}
