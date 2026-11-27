import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { formatBytes, percent } from '#/platform/ui/format'
import { MapScreen } from './MapScreen'
import { downloadAustraliaMap, getMapProgress } from './map.functions'
import type { MapData } from './types'

export function MapPage({ data }: { data: MapData }) {
  if (data.current) return <MapScreen key={data.current.contentId} data={data} />
  return <NoMap data={data} />
}

/** No map file yet: offer the map of Australia, and follow its download. */
function NoMap({ data }: { data: MapData }) {
  const router = useRouter()
  const [download, setDownload] = useState(data.download)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!download) return
    const t = setInterval(async () => {
      try {
        const p = await getMapProgress()
        setDownload(p.download)
        // Ready once the Library has picked the file up.
        if (p.sources > 0) void router.invalidate()
      } catch {
        // Try again next tick.
      }
    }, 2000)
    return () => clearInterval(t)
  }, [download, router])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const d = await downloadAustraliaMap()
      setDownload({ title: d.title, bytes: d.bytes, sizeBytes: d.sizeBytes, state: d.state })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page map-empty-page">
      <div className="map-empty-art" aria-hidden="true" />
      <section className="card map-empty">
        <span className="eyebrow">RECON · OFFLINE MAPS</span>
        <h1>{download ? 'Your map is on its way' : 'No maps yet'}</h1>
        {!data.libraryOnline && <div className="notice warn">The library server isn't running. Map files are read by it, so start it first.</div>}
        {download ? (
          <>
            <p className="lead">
              {download.title}: {formatBytes(download.bytes)} of {formatBytes(download.sizeBytes)}. It opens here as soon as it's in.
            </p>
            <div className="dl-track" role="progressbar" aria-label={`${download.title} download`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(download.bytes, download.sizeBytes)}>
              <div style={{ width: `${percent(download.bytes, download.sizeBytes)}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="lead">
              The map of Australia has every road, town and landmark, with place search, and works with no internet. It's about 1.9 GB.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn accent" disabled={busy} onClick={start}>
                {busy ? 'Starting…' : 'Download the map of Australia'}
              </button>
              <Link to="/library/sources" className="btn secondary">
                Other regions
              </Link>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Other countries and regions are in Library › Sources › Browse everything: search for “maps”.
            </p>
          </>
        )}
        {error && <div className="notice bad">{error}</div>}
      </section>
    </main>
  )
}
