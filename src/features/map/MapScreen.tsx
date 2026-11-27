import type { GeoJSONSource, Map as MlMap, Marker as MlMarker, MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bearing, compass, COORD_FORMATS, COORD_LABEL, distance, formatCoord, formatDistance, type CoordFormat } from './geo'
import { deleteWaypoint, getMapProgress, saveWaypoint } from './map.functions'
import { loadStyle, type MapTheme } from './style'
import { MapSearch, type SearchPick } from './ui/MapSearch'
import { WaypointForm, type Draft } from './ui/WaypointForm'
import { KindBadge } from './ui/KindBadge'
import { ago } from '#/features/library/format'
import { KIND_STYLE, type IndexStatus, type MapData, type Waypoint } from './types'

type Point = { lat: number; lon: number }
type Selection = { type: 'point'; lat: number; lon: number; name?: string; detail?: string } | { type: 'waypoint'; id: number } | null

const PREFS_KEY = 'outpost.map'
const viewKey = (id: string) => `outpost.map.view.${id}`

function readPrefs(): { theme: MapTheme; format: CoordFormat } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { theme?: string; format?: string }
    return {
      theme: p.theme === 'night' ? 'night' : 'paper',
      format: (COORD_FORMATS as string[]).includes(p.format ?? '') ? (p.format as CoordFormat) : 'decimal',
    }
  } catch {
    return { theme: 'paper', format: 'decimal' }
  }
}

function writePrefs(p: { theme: MapTheme; format: CoordFormat }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Storage can be refused; the choice still applies until reload.
  }
}

function waypointGeoJSON(list: Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: list.map((w) => ({
      type: 'Feature',
      id: w.id,
      geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
      properties: { id: w.id, name: w.name, letter: KIND_STYLE[w.kind].letter, color: KIND_STYLE[w.kind].color, ink: KIND_STYLE[w.kind].ink },
    })),
  }
}

const RADIO_WORDS = { chat: 'Radio', repeater: 'Repeater', room: 'Room server', sensor: 'Sensor', unknown: 'Radio' } as const

function radioGeoJSON(list: MapData['radios']): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: list.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { i, name: r.name, repeater: r.type === 'repeater' },
    })),
  }
}

function measureGeoJSON(points: Point[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      ...(points.length > 1 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: points.map((p) => [p.lon, p.lat]) }, properties: {} }] : []),
      ...points.map((p) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: {} })),
    ],
  }
}

/**
 * The map: the offline map file drawn with MapLibre, plus Outpost's own
 * layers on top (waypoints, the measuring line) and a side panel for
 * whatever's selected. Clicking the map drops a pin; pins can be saved as
 * waypoints, measured from, and found again by search.
 */
export function MapScreen({ data }: { data: MapData }) {
  const source = data.current!
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const pinRef = useRef<MlMarker | null>(null)
  const meRef = useRef<MlMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState(() => (typeof window === 'undefined' ? { theme: 'paper' as MapTheme, format: 'decimal' as CoordFormat } : readPrefs()))
  const [waypoints, setWaypoints] = useState(data.waypoints)
  const [selection, setSelection] = useState<Selection>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [measure, setMeasure] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [zoom, setZoom] = useState(0)
  const [index, setIndex] = useState<IndexStatus | null>(data.index)
  const [panelOpen, setPanelOpen] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showRadios, setShowRadios] = useState(true)
  const canLocate = typeof window !== 'undefined' && window.isSecureContext && 'geolocation' in navigator

  // Refs so map event handlers (registered once) see the latest state.
  const live = useRef({ measuring, waypoints, measure, draft, showRadios })
  live.current = { measuring, waypoints, measure, draft, showRadios }

  const home = waypoints.find((w) => w.kind === 'home') ?? null
  const selectedWaypoint = selection?.type === 'waypoint' ? (waypoints.find((w) => w.id === selection.id) ?? null) : null

  useEffect(() => writePrefs(prefs), [prefs])

  // Fill the window below the header, whatever height it wraps to.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fit = () => {
      const header = document.querySelector<HTMLElement>('.shell-header')
      root.current?.style.setProperty('--map-top', `${header?.offsetHeight ?? 0}px`)
      mapRef.current?.resize()
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Our layers, added after every style load (a theme change replaces the style).
  const addOverlays = useCallback((map: MlMap) => {
    if (!map.getSource('wp')) map.addSource('wp', { type: 'geojson', data: waypointGeoJSON(live.current.waypoints) })
    if (!map.getSource('measure')) map.addSource('measure', { type: 'geojson', data: measureGeoJSON(live.current.measure) })
    const night = map.getStyle().name?.toString().includes('dark') ?? false
    if (!map.getLayer('measure-line')) {
      map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#C2652A', 'line-width': 3, 'line-dasharray': [2, 1.2] } })
      map.addLayer({ id: 'measure-pts', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#C2652A', 'circle-stroke-width': 2.5 } })
    }
    if (!map.getSource('radios')) map.addSource('radios', { type: 'geojson', data: radioGeoJSON(data.radios) })
    if (!map.getLayer('radio-dot')) {
      // Radios: small dark dots with a ring (repeaters a little bigger), kept apart from waypoint markers.
      map.addLayer({
        id: 'radio-dot',
        type: 'circle',
        source: 'radios',
        layout: { visibility: live.current.showRadios ? 'visible' : 'none' },
        paint: {
          'circle-radius': ['case', ['get', 'repeater'], 6.5, 5],
          'circle-color': night ? '#e7e3da' : '#1f2421',
          'circle-stroke-color': night ? '#151a19' : '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'radio-label',
        type: 'symbol',
        source: 'radios',
        minzoom: 9,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, visibility: live.current.showRadios ? 'visible' : 'none' },
        paint: { 'text-color': night ? '#cfcac0' : '#3a403c', 'text-halo-color': night ? '#151a19' : '#ffffff', 'text-halo-width': 1.5 },
      })
    }
    if (!map.getLayer('wp-circle')) {
      map.addLayer({ id: 'wp-circle', type: 'circle', source: 'wp', paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-color': night ? '#151a19' : '#ffffff', 'circle-stroke-width': 2.5 } })
      map.addLayer({
        id: 'wp-letter',
        type: 'symbol',
        source: 'wp',
        layout: { 'text-field': ['get', 'letter'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': ['get', 'ink'] },
      })
      map.addLayer({
        id: 'wp-label',
        type: 'symbol',
        source: 'wp',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': night ? '#e7e3da' : '#1f2421', 'text-halo-color': night ? '#151a19' : '#ffffff', 'text-halo-width': 1.6 },
      })
    }
  }, [])

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    let map: MlMap | null = null
    ;(async () => {
      try {
        const ml = await import('maplibre-gl')
        // Bundled by Vite with everything it imports; MapLibre's default path doesn't survive bundling.
        const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
        ml.setWorkerUrl(workerUrl)
        const style = await loadStyle(source.contentId, prefs.theme)
        if (cancelled || !box.current) return
        let saved: { center: [number, number]; zoom: number } | null = null
        try {
          saved = JSON.parse(localStorage.getItem(viewKey(source.contentId)) ?? 'null')
        } catch {
          saved = null
        }
        map = new ml.Map({
          container: box.current,
          style,
          ...(saved ? { center: saved.center, zoom: saved.zoom } : source.bounds ? { bounds: source.bounds, fitBoundsOptions: { padding: 40 } } : { center: [134, -26], zoom: 3 }),
          maxZoom: 18,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        })
        mapRef.current = map
        map.addControl(new ml.NavigationControl({ visualizePitch: false }), 'top-right')
        map.addControl(new ml.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-right')
        map.on('style.load', () => addOverlays(map!))
        map.on('load', () => {
          setReady(true)
          setZoom(map!.getZoom())
        })
        map.on('zoom', () => setZoom(map!.getZoom()))
        map.on('moveend', () => {
          const c = map!.getCenter()
          try {
            localStorage.setItem(viewKey(source.contentId), JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }))
          } catch {
            // Not remembering the view is fine.
          }
        })
        map.on('mousemove', (e: MapMouseEvent) => setCursor({ lat: e.lngLat.lat, lon: e.lngLat.lng }))
        map.on('mouseout', () => setCursor(null))
        map.on('click', (e: MapMouseEvent) => {
          const { measuring, draft } = live.current
          const at = { lat: e.lngLat.lat, lon: e.lngLat.lng }
          if (measuring) {
            setMeasure((m) => [...m, at])
            return
          }
          if (draft) {
            setDraft({ ...draft, ...at })
            return
          }
          const hit = map!.queryRenderedFeatures(e.point, { layers: ['wp-circle'] })[0]
          const id = hit?.properties?.id
          const radio = live.current.showRadios ? map!.queryRenderedFeatures(e.point, { layers: ['radio-dot'] })[0] : undefined
          const r = typeof radio?.properties?.i === 'number' ? data.radios[radio.properties.i] : undefined
          if (typeof id === 'number') setSelection({ type: 'waypoint', id })
          else if (r) setSelection({ type: 'point', lat: r.lat, lon: r.lon, name: r.name, detail: `${RADIO_WORDS[r.type]}${r.lastAdvert ? ` · heard ${ago(r.lastAdvert)}` : ''}` })
          else setSelection({ type: 'point', ...at })
          setConfirmDelete(false)
          setPanelOpen(true)
        })
        map.on('mouseenter', 'wp-circle', () => (map!.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', 'wp-circle', () => (map!.getCanvas().style.cursor = ''))
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
    // The map is made once per map file; theme changes swap the style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.contentId, addOverlays])

  // Theme: swap the style, then our layers come back on style.load.
  const themeApplied = useRef(prefs.theme)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || themeApplied.current === prefs.theme) return
    themeApplied.current = prefs.theme
    loadStyle(source.contentId, prefs.theme)
      .then((style) => map.setStyle(style))
      .catch((err: Error) => setError(err.message))
  }, [prefs.theme, ready, source.contentId])

  useEffect(() => {
    ;(mapRef.current?.getSource('wp') as GeoJSONSource | undefined)?.setData(waypointGeoJSON(waypoints))
  }, [waypoints, ready])

  useEffect(() => {
    ;(mapRef.current?.getSource('measure') as GeoJSONSource | undefined)?.setData(measureGeoJSON(measure))
  }, [measure, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const id of ['radio-dot', 'radio-label']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showRadios ? 'visible' : 'none')
  }, [showRadios, ready])

  // The pin: shows the selected spot, and can be dragged while editing a waypoint.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const at = draft ?? (selection?.type === 'point' ? selection : null)
    if (!at) {
      pinRef.current?.remove()
      pinRef.current = null
      return
    }
    let cancelled = false
    void import('maplibre-gl').then((ml) => {
      if (cancelled) return
      if (!pinRef.current) {
        const el = document.createElement('div')
        el.className = 'map-pin'
        pinRef.current = new ml.Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([at.lon, at.lat]).addTo(map)
      }
      const pin = pinRef.current
      pin.setLngLat([at.lon, at.lat])
      pin.setDraggable(!!draft)
      pin.getElement().classList.toggle('dragging', !!draft)
      pin.off('dragend', onDrag)
      pin.on('dragend', onDrag)
    })
    function onDrag() {
      const ll = pinRef.current!.getLngLat()
      setDraft((d) => (d ? { ...d, lat: ll.lat, lon: ll.lng } : d))
    }
    return () => {
      cancelled = true
    }
  }, [draft, selection, ready])

  // Keep the place index progress fresh while it builds.
  useEffect(() => {
    if (index?.state !== 'building') return
    const t = setInterval(async () => {
      try {
        setIndex((await getMapProgress()).index)
      } catch {
        // Try again next tick.
      }
    }, 2000)
    return () => clearInterval(t)
  }, [index?.state])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input, textarea')) return
      if (measuring) setMeasuring(false)
      else if (draft) setDraft(null)
      else setSelection(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [measuring, draft])

  function flyTo(p: Point, z?: number) {
    mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: z ?? Math.max(mapRef.current.getZoom(), 13), essential: true, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 })
  }

  function onPick(pick: SearchPick) {
    setMeasuring(false)
    setDraft(null)
    setPanelOpen(true)
    if (pick.type === 'waypoint') {
      setSelection({ type: 'waypoint', id: pick.waypoint.id })
      flyTo(pick.waypoint, 15)
    } else {
      setSelection({ type: 'point', lat: pick.lat, lon: pick.lon, name: pick.name, detail: pick.detail })
      flyTo(pick, pick.zoom)
    }
  }

  async function save(d: Draft) {
    const saved = await saveWaypoint({ data: { id: d.id, name: d.name, kind: d.kind, notes: d.notes, lat: d.lat, lon: d.lon } })
    setWaypoints((list) => [...list.filter((w) => w.id !== saved.id), saved].sort((a, b) => Number(b.kind === 'home') - Number(a.kind === 'home') || a.name.localeCompare(b.name)))
    setDraft(null)
    setSelection({ type: 'waypoint', id: saved.id })
  }

  async function remove(w: Waypoint) {
    await deleteWaypoint({ data: { id: w.id } })
    setWaypoints((list) => list.filter((x) => x.id !== w.id))
    setSelection(null)
    setConfirmDelete(false)
  }

  function startMeasure(from?: Point) {
    setDraft(null)
    setSelection(null)
    setMeasure(from ? [from] : [])
    setMeasuring(true)
    setPanelOpen(true)
  }

  function locate() {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        const ml = await import('maplibre-gl')
        if (!meRef.current && mapRef.current) {
          const el = document.createElement('div')
          el.className = 'map-me'
          meRef.current = new ml.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(mapRef.current)
        }
        meRef.current?.setLngLat([p.lon, p.lat])
        flyTo(p, 15)
      },
      (err) => setError(`Couldn't get your location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard needs a secure page; the text is on screen to copy by hand.
    }
  }

  const legs = useMemo(() => measure.slice(1).map((p, i) => distance(measure[i]!, p)), [measure])
  const total = legs.reduce((a, b) => a + b, 0)
  const shown = cursor ?? (mapRef.current ? { lat: mapRef.current.getCenter().lat, lon: mapRef.current.getCenter().lng } : null)

  const fromHome = (p: Point) =>
    home && !(selectedWaypoint && selectedWaypoint.id === home.id) ? `${formatDistance(distance(home, p))} ${compass(bearing(home, p))} of ${home.name}` : null

  return (
    <div ref={root} className={`map-screen theme-${prefs.theme}${panelOpen ? ' panel-open' : ''}`}>
      <div ref={box} className="map-canvas" aria-label={`Map: ${source.title}`} role="region" />
      {!ready && !error && (
        <div className="map-loading" role="status">
          Loading the map…
        </div>
      )}

      <div className="map-side">
        <MapSearch contentId={source.contentId} waypoints={waypoints} index={index} near={shown} onPick={onPick} />

        <section className="map-panel" aria-label="Map details">
          <button type="button" className="map-panel-grip" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <span aria-hidden="true" />
            <span className="visually-hidden">{panelOpen ? 'Hide the panel' : 'Show the panel'}</span>
          </button>
          {error && <div className="notice bad">{error}</div>}

          {measuring ? (
            <div className="map-panel-body">
              <div className="map-panel-head">
                <span className="mono">MEASURE</span>
                <button type="button" className="link-btn" onClick={() => setMeasuring(false)}>
                  Done
                </button>
              </div>
              <span className="big-number" style={{ fontSize: 34 }}>
                {formatDistance(total)}
              </span>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                {measure.length === 0 ? 'Tap the map to start measuring.' : measure.length === 1 ? 'Tap the next point.' : `${legs.length} leg${legs.length === 1 ? '' : 's'}. Keep tapping to add more.`}
              </p>
              {legs.length > 1 && (
                <ol className="map-legs">
                  {legs.map((l, i) => (
                    <li key={i}>
                      <span>Leg {i + 1}</span>
                      <span>
                        {formatDistance(l)} {compass(bearing(measure[i]!, measure[i + 1]!))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="map-actions">
                <button type="button" className="tool-btn" disabled={!measure.length} onClick={() => setMeasure((m) => m.slice(0, -1))}>
                  Undo
                </button>
                <button type="button" className="tool-btn" disabled={!measure.length} onClick={() => setMeasure([])}>
                  Clear
                </button>
              </div>
            </div>
          ) : draft ? (
            <div className="map-panel-body">
              <WaypointForm draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} format={prefs.format} />
            </div>
          ) : selectedWaypoint ? (
            <div className="map-panel-body">
              <div className="map-panel-head">
                <KindBadge kind={selectedWaypoint.kind} />
                <button type="button" className="link-btn" onClick={() => setSelection(null)}>
                  Close
                </button>
              </div>
              <h2 className="map-title">{selectedWaypoint.name}</h2>
              {selectedWaypoint.notes && <p className="map-notes">{selectedWaypoint.notes}</p>}
              <Coords p={selectedWaypoint} onCopy={copy} copied={copied} />
              {fromHome(selectedWaypoint) && <p className="muted map-from">{fromHome(selectedWaypoint)}</p>}
              <div className="map-actions">
                <button type="button" className="tool-btn" onClick={() => setDraft({ ...selectedWaypoint })}>
                  Edit or move
                </button>
                <button type="button" className="tool-btn" onClick={() => startMeasure(selectedWaypoint)}>
                  Measure from here
                </button>
                <button
                  type="button"
                  className={`tool-btn${confirmDelete ? ' danger' : ''}`}
                  onBlur={() => setConfirmDelete(false)}
                  onClick={() => (confirmDelete ? remove(selectedWaypoint) : setConfirmDelete(true))}
                >
                  {confirmDelete ? 'Delete for good?' : 'Delete'}
                </button>
              </div>
            </div>
          ) : selection?.type === 'point' ? (
            <div className="map-panel-body">
              <div className="map-panel-head">
                <span className="mono">{selection.detail?.toUpperCase() ?? 'DROPPED PIN'}</span>
                <button type="button" className="link-btn" onClick={() => setSelection(null)}>
                  Close
                </button>
              </div>
              {selection.name && <h2 className="map-title">{selection.name}</h2>}
              <Coords p={selection} onCopy={copy} copied={copied} />
              {fromHome(selection) && <p className="muted map-from">{fromHome(selection)}</p>}
              <div className="map-actions">
                <button type="button" className="tool-btn accent" onClick={() => setDraft({ name: selection.name ?? '', kind: home ? 'other' : 'home', notes: '', lat: selection.lat, lon: selection.lon })}>
                  Save as waypoint
                </button>
                <button type="button" className="tool-btn" onClick={() => startMeasure(selection)}>
                  Measure from here
                </button>
              </div>
            </div>
          ) : (
            <div className="map-panel-body">
              <div className="map-panel-head">
                <span className="mono">WAYPOINTS · {waypoints.length}</span>
                {waypoints.length > 0 && (
                  <a className="link-btn" href="/api/map/waypoints.gpx" download>
                    Export GPX
                  </a>
                )}
              </div>
              {waypoints.length === 0 ? (
                <p className="muted" style={{ margin: 0, lineHeight: 1.55, fontSize: 14 }}>
                  Tap anywhere to drop a pin, then save it: home, a meeting point, water, fuel, shelter. Waypoints are kept on this server for everyone at home.
                </p>
              ) : (
                <ul className="map-wp-list">
                  {waypoints.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection({ type: 'waypoint', id: w.id })
                          flyTo(w, 15)
                        }}
                      >
                        <KindBadge kind={w.kind} compact />
                        <span className="map-wp-name">{w.name}</span>
                        <span className="muted">{home && home.id !== w.id ? formatDistance(distance(home, w)) : KIND_STYLE[w.kind].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {index && index.state !== 'ready' && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {index.state === 'building'
                    ? `Building place search: ${index.total ? Math.round((index.done / index.total) * 100) : 0}% of the map read.`
                    : index.state === 'failed'
                      ? `Place search couldn't be built: ${index.error}`
                      : 'Place search will be built shortly.'}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="map-tools" role="toolbar" aria-label="Map tools">
        <button type="button" className={`map-tool${measuring ? ' on' : ''}`} aria-pressed={measuring} onClick={() => (measuring ? setMeasuring(false) : startMeasure())} title="Measure distance">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17 17 3l4 4L7 21z" />
            <path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
          </svg>
          <span>Measure</span>
        </button>
        <button type="button" className="map-tool" onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === 'night' ? 'paper' : 'night' }))} title="Switch between paper and night">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {prefs.theme === 'night' ? <circle cx="12" cy="12" r="4.5" /> : <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
          </svg>
          <span>{prefs.theme === 'night' ? 'Paper' : 'Night'}</span>
        </button>
        {source.bounds && (
          <button type="button" className="map-tool" onClick={() => mapRef.current?.fitBounds(source.bounds!, { padding: 40 })} title={`Show all of ${source.title}`}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            <span>Whole map</span>
          </button>
        )}
        {home && (
          <button type="button" className="map-tool" onClick={() => onPick({ type: 'waypoint', waypoint: home })} title={`Go to ${home.name}`}>
            <span aria-hidden="true" className="map-tool-letter" style={{ background: KIND_STYLE.home.color, color: KIND_STYLE.home.ink }}>
              H
            </span>
            <span>Home</span>
          </button>
        )}
        {data.radios.length > 0 && (
          <button type="button" className={`map-tool${showRadios ? ' on-soft' : ''}`} aria-pressed={showRadios} onClick={() => setShowRadios((s) => !s)} title="Show MeshCore radios that share their position">
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: '18px' }}>
              ◆
            </span>
            <span>Radios</span>
          </button>
        )}
        {canLocate && (
          <button type="button" className="map-tool" onClick={locate} title="Show where you are">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span>Me</span>
          </button>
        )}
      </div>

      <button
        type="button"
        className="map-coords"
        onClick={() => setPrefs((p) => ({ ...p, format: COORD_FORMATS[(COORD_FORMATS.indexOf(p.format) + 1) % COORD_FORMATS.length]! }))}
        title="Change the coordinate format"
      >
        <span className="mono">{COORD_LABEL[prefs.format].toUpperCase()}</span>
        <span>{shown ? formatCoord(shown.lat, shown.lon, prefs.format) : '—'}</span>
        <span className="muted">z{zoom.toFixed(1)}</span>
      </button>
    </div>
  )
}

function Coords({ p, onCopy, copied }: { p: Point; onCopy: (t: string) => void; copied: boolean }) {
  return (
    <dl className="map-coord-list">
      {COORD_FORMATS.map((f) => {
        const text = formatCoord(p.lat, p.lon, f)
        return (
          <div key={f}>
            <dt>{COORD_LABEL[f]}</dt>
            <dd>
              <button type="button" onClick={() => onCopy(text)} title="Copy">
                {text}
              </button>
            </dd>
          </div>
        )
      })}
      {copied && (
        <span className="map-copied" role="status">
          Copied
        </span>
      )}
    </dl>
  )
}
