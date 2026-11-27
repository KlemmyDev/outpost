import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { readHref } from '../format'
import { suggestLibrary } from '../library.functions'
import type { Suggestion } from '../types'

/**
 * Search across every book. Titles are suggested while typing (arrow keys move
 * through them, Enter opens one); Enter on its own searches the full text.
 */
export function SearchBox({ initial = '', autoFocus = false, large = false, placeholder = 'Search the library' }: { initial?: string; autoFocus?: boolean; large?: boolean; placeholder?: string }) {
  const navigate = useNavigate()
  const listId = useId()
  const [q, setQ] = useState(initial)
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const seq = useRef(0)

  useEffect(() => setQ(initial), [initial])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setItems([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const list = await suggestLibrary({ data: { q: term } })
        if (mine === seq.current) {
          setItems(list)
          setActive(-1)
        }
      } catch {
        if (mine === seq.current) setItems([])
      }
    }, 140)
    return () => clearTimeout(t)
  }, [q])

  function go(s?: Suggestion) {
    setOpen(false)
    if (s) void navigate({ href: readHref(s.contentId, s.path) })
    else if (q.trim()) void navigate({ to: '/library/search', search: { q: q.trim() } })
  }

  const showList = open && items.length > 0

  return (
    <form
      role="search"
      className={`lib-search${large ? ' large' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        go(active >= 0 ? items[active] : undefined)
      }}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label="Search the library"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') setActive((a) => Math.min(items.length - 1, a + 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(-1, a - 1))
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      <button type="submit" className="btn accent">
        Search
      </button>
      {showList && (
        <ul className="lib-suggest" id={listId} role="listbox" aria-label="Suggested articles">
          {items.map((s, i) => (
            <li
              key={`${s.contentId}/${s.path}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault()
                go(s)
              }}
            >
              <span>{s.title}</span>
              <span className="muted">{s.bookTitle}</span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={active === -1}
            className="lib-suggest-all"
            onPointerDown={(e) => {
              e.preventDefault()
              go()
            }}
          >
            Search every page for “{q.trim()}”
          </li>
        </ul>
      )}
    </form>
  )
}
