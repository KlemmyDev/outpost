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
 * A time series chart: lines or bars on one axis, a hover crosshair with the
 * values, arrow keys to step through points, and a table for anyone who'd
 * rather read numbers. Gaps in the data show as gaps.
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
}) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const tableId = useId()
  const n = times.length

  const max = useMemo(() => {
    const top = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), threshold?.value ?? 0)
    return yMax ?? niceMax(top * 1.1)
  }, [series, threshold, yMax])

  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => height - (v / max) * (height - 8)

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

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || n === 0) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setHover(n <= 1 ? 0 : Math.round(ratio * (n - 1)))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const bars = series.filter((s) => s.kind === 'bar')
  const lines = series.filter((s) => s.kind !== 'bar')
  const slot = W / Math.max(1, n)
  const hoverLeft = hover === null ? 0 : bars.length ? ((hover + 0.5) / n) * 100 : (x(hover) / W) * 100

  return (
    <figure className="chart" style={{ margin: 0 }}>
      {series.length > 1 && (
        <figcaption className="chart-legend">
          {series.map((s) => (
            <span key={s.key}>
              <span aria-hidden="true" className={s.kind === 'bar' ? 'swatch bar' : 'swatch'} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div className="chart-plot" style={{ height }}>
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
          {bars.map((s) =>
            s.values.map((v, i) =>
              v === null || v <= 0 ? null : (
                <rect key={`${s.key}-${i}`} x={i * slot + 1} width={Math.max(1, slot - 2)} y={y(v)} height={height - y(v)} rx="2" fill={s.color} />
              ),
            ),
          )}
          {threshold && threshold.value <= max && (
            <line x1="0" x2={W} y1={y(threshold.value)} y2={y(threshold.value)} className="chart-threshold" vectorEffect="non-scaling-stroke" />
          )}
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
          aria-label={`${label}. Use the left and right arrow keys to read each point.`}
          aria-describedby={tableId}
          onPointerMove={pick}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        />
        {hover !== null && times[hover] !== undefined && (
          <>
            <span className="chart-cursor" style={{ left: `${hoverLeft}%` }} aria-hidden="true" />
            <div className="chart-tip" style={{ left: `${hoverLeft}%`, transform: `translateX(${hoverLeft > 70 ? '-105%' : '5%'})` }} role="status">
              <strong>{formatTime(times[hover])}</strong>
              {series.map((s) => (
                <span key={s.key}>
                  <span aria-hidden="true" className="swatch" style={{ background: s.color }} />
                  {series.length > 1 ? `${s.label}: ` : ''}
                  {fmt(s.values[hover] ?? null, unit, decimals)}
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
