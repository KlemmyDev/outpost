import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export interface Series {
  key: string
  label: string
  color: string
  values: (number | null)[]
  kind?: 'line' | 'bar'
}

const W = 1000

/** Rounds a maximum up to a tidy axis value: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1
  const p = 10 ** Math.floor(Math.log10(value))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= value) return m * p
  return 10 * p
}

function fmt(v: number | null, unit: string, decimals: number): string {
  return v === null ? 'No data' : `${v.toFixed(decimals)} ${unit}`
}

/**
 * A time series chart: lines or bars on one axis.
 *
 * - Hover (or arrow keys) shows a crosshair, a dot on each line and the values.
 * - Click (or Enter) pins the tooltip in place; Escape or a second click lets go.
 * - The legend's entries are buttons that show and hide each series.
 * - Lines draw in and bars grow when the chart appears or its range changes.
 * - `highlight` shades a span of time, e.g. the event being hovered elsewhere.
 * - A table shows every value for anyone who'd rather read numbers.
 */
export function TimeChart({
  times,
  series,
  unit,
  height = 180,
  yMax,
  threshold,
  decimals = 0,
  label,
  formatTime,
  markers = false,
  highlight,
}: {
  times: number[]
  series: Series[]
  unit: string
  height?: number
  yMax?: number
  threshold?: { value: number; label: string }
  decimals?: number
  /** Describes the chart for screen readers. */
  label: string
  formatTime: (t: number) => string
  /** Draw a dot on each point (for sparse data such as speed tests). */
  markers?: boolean
  /** A span of time to shade, in ms. */
  highlight?: { from: number; to: number; label?: string } | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const box = useRef<HTMLDivElement>(null)
  const tableId = useId()
  const n = times.length
  const active = pinned ?? hover

  const visible = series.filter((s) => !hidden.has(s.key))
  const max = useMemo(() => {
    const top = Math.max(0, ...visible.flatMap((s) => s.values.filter((v): v is number => v !== null)), threshold?.value ?? 0)
    return yMax ?? niceMax(top * 1.1)
  }, [visible, threshold, yMax])

  const bars = visible.filter((s) => s.kind === 'bar')
  const lines = visible.filter((s) => s.kind !== 'bar')
  const hasBars = series.some((s) => s.kind === 'bar')
  const slot = W / Math.max(1, n)
  const x = (i: number) => (hasBars ? (i + 0.5) * slot : n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => height - (v / max) * (height - 8)
  const pct = (i: number) => (x(i) / W) * 100

  // Replays the draw-in animation whenever the data's time window changes.
  const animKey = `${times[0] ?? 0}-${n}-${max}-${[...hidden].join(',')}`

  function linePath(values: (number | null)[]): string {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }

  function indexAt(clientX: number): number | null {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || n === 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return hasBars ? Math.min(n - 1, Math.floor(ratio * n)) : n <= 1 ? 0 : Math.round(ratio * (n - 1))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return
    const from = active ?? -1
    if (e.key === 'ArrowRight') {
      const next = Math.min(n - 1, from + 1)
      pinned !== null ? setPinned(next) : setHover(next)
    } else if (e.key === 'ArrowLeft') {
      const next = Math.max(0, (active ?? n) - 1)
      pinned !== null ? setPinned(next) : setHover(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      setPinned((p) => (p === null ? (hover ?? n - 1) : null))
    } else if (e.key === 'Escape') {
      setPinned(null)
      setHover(null)
    } else return
    e.preventDefault()
  }

  function toggle(key: string) {
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(key)) next.delete(key)
      else if (series.length - next.size > 1) next.add(key) // always keep one series showing
      return next
    })
  }

  // Shaded span for `highlight`, mapped from time onto the x axis.
  let band: { left: number; width: number } | null = null
  if (highlight && n > 0) {
    const t0 = times[0]!
    const step = n > 1 ? (times[n - 1]! - t0) / (n - 1) : 1
    const toPct = (t: number) => {
      const i = (t - t0) / step
      return Math.min(100, Math.max(0, hasBars ? ((i + (t === highlight.to ? 1 : 0)) / n) * 100 : (i / Math.max(1, n - 1)) * 100))
    }
    const left = toPct(highlight.from)
    const right = Math.max(left + 0.6, toPct(highlight.to))
    if (right > 0 && left < 100) band = { left, width: Math.min(100, right) - left }
  }

  const tipLeft = active === null ? 0 : pct(active)

  return (
    <figure className="chart" style={{ margin: 0 }}>
      {series.length > 1 && (
        <div className="chart-legend" role="group" aria-label="Show or hide series">
          {series.map((s) => (
            <button key={s.key} type="button" className="legend-btn" aria-pressed={!hidden.has(s.key)} onClick={() => toggle(s.key)}>
              <span aria-hidden="true" className={s.kind === 'bar' ? 'swatch bar' : 'swatch'} style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className={`chart-plot${pinned !== null ? ' pinned' : ''}`} style={{ height }}>
        {band && (
          <span className="chart-band" style={{ left: `${band.left}%`, width: `${band.width}%` }} aria-hidden="true">
            {highlight?.label && <span>{highlight.label}</span>}
          </span>
        )}
        <span className="chart-y" style={{ top: 0 }}>
          {max} {unit}
        </span>
        <span className="chart-y" style={{ top: '50%' }}>
          {max / 2}
        </span>
        <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1="0" x2={W} y1={height - f * (height - 8)} y2={height - f * (height - 8)} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          <g className="chart-bars" key={`bars-${animKey}`}>
            {bars.map((s) =>
              s.values.map((v, i) =>
                v === null || v <= 0 ? null : (
                  <rect
                    key={`${s.key}-${i}`}
                    x={i * slot + 1}
                    width={Math.max(1, slot - 2)}
                    y={y(v)}
                    height={height - y(v)}
                    rx="2"
                    fill={s.color}
                    opacity={active === null || active === i ? 1 : 0.45}
                    style={{ animationDelay: `${Math.min(0.4, (i / Math.max(1, n)) * 0.4)}s` }}
                  />
                ),
              ),
            )}
          </g>
          {threshold && threshold.value <= max && (
            <line x1="0" x2={W} y1={y(threshold.value)} y2={y(threshold.value)} className="chart-threshold" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Lines live in their own layer so they can be revealed left to right. */}
        <div className="chart-reveal" key={`lines-${animKey}`}>
          <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {lines.map((s) => (
              <path key={s.key} d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
            {markers &&
              lines.map((s) =>
                s.values.map((v, i) =>
                  v === null ? null : (
                    // A zero-length segment with round caps stays a circle under preserveAspectRatio="none".
                    <path key={`${s.key}-m${i}`} d={`M${x(i)} ${y(v)} h0`} stroke={s.color} strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  ),
                ),
              )}
          </svg>
        </div>
        {threshold && threshold.value <= max && (
          <span className="chart-threshold-label" style={{ top: `${(y(threshold.value) / height) * 100}%` }}>
            {threshold.label}
          </span>
        )}
        <div
          ref={box}
          className="chart-hit"
          tabIndex={0}
          role="img"
          aria-label={`${label}. Arrow keys read each point, Enter pins it.`}
          aria-describedby={tableId}
          onPointerMove={(e: PointerEvent<HTMLDivElement>) => setHover(indexAt(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const i = indexAt(e.clientX)
            setPinned((p) => (p === i ? null : i))
          }}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        />
        {active !== null && times[active] !== undefined && (
          <>
            <span className="chart-cursor" style={{ left: `${tipLeft}%` }} aria-hidden="true" />
            {lines.map((s) => {
              const v = s.values[active]
              return v === null || v === undefined ? null : (
                <span
                  key={s.key}
                  className="chart-dot"
                  style={{ left: `${tipLeft}%`, top: `${(y(v) / height) * 100}%`, borderColor: s.color }}
                  aria-hidden="true"
                />
              )
            })}
            <div className="chart-tip" style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 70 ? '-105%' : '5%'})` }} role="status">
              <strong>
                {formatTime(times[active])}
                {pinned !== null && <span className="tip-pin"> · pinned</span>}
              </strong>
              {visible.map((s) => (
                <span key={s.key}>
                  <span aria-hidden="true" className="swatch" style={{ background: s.color }} />
                  {series.length > 1 ? `${s.label}: ` : ''}
                  {fmt(s.values[active] ?? null, unit, decimals)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      {n > 0 && (
        <div className="chart-x">
          <span>{formatTime(times[0]!)}</span>
          {n > 2 && <span>{formatTime(times[Math.floor(n / 2)]!)}</span>}
          <span>{formatTime(times[n - 1]!)}</span>
        </div>
      )}
      <details className="chart-table" id={tableId}>
        <summary>Show as table</summary>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((t, i) =>
                series.every((s) => s.values[i] === null) ? null : (
                  <tr key={t}>
                    <td>{formatTime(t)}</td>
                    {series.map((s) => (
                      <td key={s.key}>{s.values[i] === null ? '—' : s.values[i]!.toFixed(decimals)}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
