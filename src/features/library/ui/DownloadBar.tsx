import { formatBytes } from '#/platform/ui/format'
import { duration } from '../format'
import { flavourLabel, type Download } from '../types'

const STATE_WORDS: Record<Download['state'], string> = {
  queued: 'Waiting',
  downloading: 'Downloading',
  verifying: 'Checking the file',
  paused: 'Paused',
  failed: 'Stopped',
  done: 'Ready',
  cancelled: 'Cancelled',
}

/** One download: its name, a progress bar, and how far and how fast it's going. */
export function DownloadBar({ d, children }: { d: Download; children?: React.ReactNode }) {
  const pct = d.state === 'verifying' ? Math.round((d.verified ?? 0) * 100) : d.sizeBytes > 0 ? Math.min(100, Math.round((d.bytes / d.sizeBytes) * 100)) : 0
  const left = d.bytesPerSec ? (d.sizeBytes - d.bytes) / d.bytesPerSec : null
  const detail =
    d.state === 'downloading'
      ? [`${formatBytes(d.bytes)} of ${formatBytes(d.sizeBytes)}`, d.bytesPerSec ? `${formatBytes(d.bytesPerSec)}/s` : null, left ? `${duration(left)} left` : null]
      : d.state === 'verifying'
        ? [`${pct}% checked`]
        : d.state === 'done'
          ? [formatBytes(d.sizeBytes)]
          : [`${formatBytes(d.bytes)} of ${formatBytes(d.sizeBytes)}`]
  return (
    <div className={`dl dl-${d.state}`}>
      <div className="dl-head">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <strong>{d.title}</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {flavourLabel(d.flavour)} · {STATE_WORDS[d.state]}
            {detail.filter(Boolean).length ? ` · ${detail.filter(Boolean).join(' · ')}` : ''}
          </span>
        </span>
        {children && <span className="dl-actions">{children}</span>}
      </div>
      <div
        className="dl-track"
        role="progressbar"
        aria-label={`${d.title}: ${STATE_WORDS[d.state].toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      {d.error && <span className={d.state === 'failed' ? 'dl-error' : 'muted'} style={{ fontSize: 13 }}>{d.error}</span>}
    </div>
  )
}
