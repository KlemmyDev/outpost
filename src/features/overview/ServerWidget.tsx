import { Link } from '@tanstack/react-router'
import type { ServerStats } from '#/platform/overview.types'
import { formatBytes, formatDuration, percent } from '#/platform/ui/format'
import { Meter, Segments, SummaryCard } from '#/platform/ui/SummaryCard'

const SERVER_ICON = 'M3 4h18v7H3zM3 13h18v7H3zM7 7.5v.1M7 16.5v.1'

function diskWarning(s: ServerStats): boolean {
  return s.disk !== null && s.disk.freeBytes / s.disk.totalBytes < 0.1
}

export function ServerCard({ stats, onOpen }: { stats: ServerStats; onOpen: () => void }) {
  const disk = stats.disk
  const used = disk ? percent(disk.totalBytes - disk.freeBytes, disk.totalBytes) : 0
  const value = stats.updateAvailable ? 'Update ready' : diskWarning(stats) ? 'Low on space' : 'All good'
  return (
    <SummaryCard
      label="Home server"
      icon={SERVER_ICON}
      tone={stats.updateAvailable || diskWarning(stats) ? 'ochre' : 'ink'}
      value={value}
      caption={
        stats.updateAvailable && stats.latestVersion
          ? `Version ${stats.latestVersion} is ready to install`
          : `Up ${formatDuration(stats.appUptimeSec)} · ${stats.features.on} of ${stats.features.total} features on`
      }
      visual={
        disk ? (
          <Segments value={used} color={diskWarning(stats) ? 'var(--ochre)' : 'var(--ironbark)'} label={`Storage ${used}% used`} />
        ) : undefined
      }
      footer={disk ? `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}` : undefined}
      onOpen={onOpen}
    />
  )
}

export function ServerDetail({ stats }: { stats: ServerStats }) {
  const memUsed = stats.memory.totalBytes - stats.memory.freeBytes
  const load = Math.min(100, percent(stats.load1, stats.cpuCount))
  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Version</div>
          <div className="v">
            {stats.version}
            {stats.release ? ` ${stats.release}` : ''}
          </div>
        </div>
        <div className="stat">
          <div className="k">Updates</div>
          <div className="v" style={{ textTransform: 'capitalize' }}>
            {stats.channel}
          </div>
        </div>
        <div className="stat">
          <div className="k">Outpost running for</div>
          <div className="v">{formatDuration(stats.appUptimeSec)}</div>
        </div>
        <div className="stat">
          <div className="k">Server up for</div>
          <div className="v">{formatDuration(stats.hostUptimeSec)}</div>
        </div>
      </div>
      <Meter label="Processor" value={load} detail={`${load}% of ${stats.cpuCount} cores`} />
      <Meter
        label="Memory"
        value={percent(memUsed, stats.memory.totalBytes)}
        detail={`${formatBytes(memUsed)} of ${formatBytes(stats.memory.totalBytes)}`}
      />
      {stats.disk && (
        <Meter
          label="Storage"
          value={percent(stats.disk.totalBytes - stats.disk.freeBytes, stats.disk.totalBytes)}
          detail={`${formatBytes(stats.disk.freeBytes)} free of ${formatBytes(stats.disk.totalBytes)}`}
        />
      )}
      {stats.updateAvailable && stats.latestVersion && (
        <div className="notice warn">Version {stats.latestVersion} is ready to install.</div>
      )}
      <p className="mono" style={{ margin: 0 }}>
        COMMIT {stats.commit ? stats.commit.slice(0, 7) : 'LOCAL BUILD'}
      </p>
      <Link to="/settings" hash="updates" className="btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
        Updates and features
      </Link>
    </>
  )
}
