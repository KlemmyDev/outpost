import { useEffect, useId, useRef, useState } from 'react'
import { formatCoord, parseCoord } from '../geo'
import { searchPlaces } from '../map.functions'
import { KIND_STYLE, type IndexStatus, type PlaceHit, type PlaceKind, type Waypoint } from '../types'

export type SearchPick = { type: 'waypoint'; waypoint: Waypoint } | { type: 'place'; name: string; detail: string; lat: number; lon: number; zoom: number }

const PLACE_WORDS: Record<PlaceKind, string> = {
  country: 'Country',
  state: 'State',
  city: 'City',
  town: 'Town',
  village: 'Village',
  suburb: 'Suburb',
  hamlet: 'Hamlet',
  locality: 'Locality',
  island: 'Island',
  peak: 'Peak',
  water: 'Water',
  other: 'Place',
}

const PLACE_ZOOM: Record<PlaceKind, number> = { country: 4, state: 5.5, city: 10, town: 12, village: 13, suburb: 14, hamlet: 14, locality: 14, island: 11, peak: 13, water: 11, other: 13 }

/**
 * Search for places (from the map's place index), your waypoints, or a
 * position typed as coordinates or MGRS.
 */
export function MapSearch({ contentId, waypoints, index, near, onPick }: { contentId: string; waypoints: Waypoint[]; index: IndexStatus | null; near: { lat: number; lon: number } | null; onPick: (p: SearchPick) => void }) {
  const listId = useId()
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<PlaceHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const nearRef = useRef(near)
  nearRef.current = near

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2 || parseCoord(term)) {
      setPlaces([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const list = await searchPlaces({ data: { q: term, contentId, lat: nearRef.current?.lat, lon: nearRef.current?.lon } })
        if (mine === seq.current) setPlaces(list)
      } catch {
        if (mine === seq.current) setPlaces([])
      }
    }, 120)
    return () => clearTimeout(t)
  }, [q, contentId])

  const term = q.trim().toLowerCase()
  const coord = parseCoord(q)
  const picks: SearchPick[] = [
    ...(coord ? [{ type: 'place' as const, name: formatCoord(coord.lat, coord.lon, 'decimal'), detail: 'Position', lat: coord.lat, lon: coord.lon, zoom: 14 }] : []),
    ...(term.length >= 1 ? waypoints.filter((w) => w.name.toLowerCase().includes(term)).slice(0, 4).map((w) => ({ type: 'waypoint' as const, waypoint: w })) : []),
    ...places.map((p) => ({ type: 'place' as const, name: p.name, detail: PLACE_WORDS[p.kind], lat: p.lat, lon: p.lon, zoom: PLACE_ZOOM[p.kind] })),
  ]
  useEffect(() => setActive(0), [q, places.length])

  function pick(p: SearchPick) {
    setOpen(false)
    setQ(p.type === 'waypoint' ? p.waypoint.name : p.name)
    onPick(p)
  }

  const showList = open && term.length >= 1
  const indexNote =
    index?.state === 'building'
      ? `Place search is being built (${index.total ? Math.round((index.done / index.total) * 100) : 0}%). Waypoints and coordinates work now.`
      : index?.state === 'ready'
        ? null
        : 'Place search isn’t ready yet. Waypoints and coordinates work now.'

  return (
    <form
      role="search"
      className="map-search"
      onSubmit={(e) => {
        e.preventDefault()
        if (picks[active]) pick(picks[active]!)
      }}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={q}
        placeholder="Search places, waypoints or coordinates"
        aria-label="Search the map"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && picks[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') setActive((a) => Math.min(picks.length - 1, a + 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      {showList && (
        <ul className="map-results" id={listId} role="listbox" aria-label="Results">
          {picks.map((p, i) => (
            <li
              key={p.type === 'waypoint' ? `w${p.waypoint.id}` : `p${p.name}${p.lat}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
            >
              {p.type === 'waypoint' ? (
                <>
                  <span className="kind-dot small" style={{ background: KIND_STYLE[p.waypoint.kind].color, color: KIND_STYLE[p.waypoint.kind].ink }} aria-hidden="true">
                    {KIND_STYLE[p.waypoint.kind].letter}
                  </span>
                  <span className="grow">{p.waypoint.name}</span>
                  <span className="muted">Waypoint</span>
                </>
              ) : (
                <>
                  <span className="grow">{p.name}</span>
                  <span className="muted">{p.detail}</span>
                </>
              )}
            </li>
          ))}
          {picks.length === 0 && <li className="map-results-empty">{indexNote ?? `Nothing called “${q.trim()}” on this map.`}</li>}
          {picks.length > 0 && indexNote && <li className="map-results-empty">{indexNote}</li>}
        </ul>
      )}
    </form>
  )
}
