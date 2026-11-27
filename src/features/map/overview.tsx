import { Link } from '@tanstack/react-router'
import { formatBytes, percent } from '#/platform/ui/format'
import { Meter, SummaryCard } from '#/platform/ui/SummaryCard'
import type { OverviewWidget } from '#/platform/features/widget'

export const widget: OverviewWidget = {
  Card: ({ feature, data, onOpen }) => {
    const s = data.map
    return (
      <SummaryCard
        label={feature.name}
        icon={feature.icon}
        tone="eucalypt"
        value={!s ? '—' : s.map ? s.map : s.download ? 'Downloading' : 'No maps yet'}
        caption={
          !s
            ? "Couldn't read the map."
            : s.map
              ? `${s.waypoints === 1 ? '1 waypoint' : `${s.waypoints} waypoints`}${s.homeSet ? '' : ', home not set'}`
              : s.download
                ? `${percent(s.download.bytes, s.download.sizeBytes)}% of ${formatBytes(s.download.sizeBytes)}`
                : 'The map of Australia is about 1.9 GB.'
        }
        footer={s?.map ? 'Offline roads, places and waypoints' : 'Download it from the Map'}
        onOpen={onOpen}
      />
    )
  },
  Detail: ({ data }) => {
    const s = data.map
    return (
      <>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {s?.map
            ? `${s.map} is on this server, with place search that works offline. ${s.waypoints ? `You've saved ${s.waypoints === 1 ? 'one waypoint' : `${s.waypoints} waypoints`}.` : 'Tap the map to save places like home and a meeting point.'}`
            : 'Download a map once and it works with no internet: roads, towns, landmarks and your own waypoints.'}
        </p>
        {s?.download && <Meter label={`Downloading ${s.download.title}`} value={percent(s.download.bytes, s.download.sizeBytes)} detail={`${formatBytes(s.download.bytes)} of ${formatBytes(s.download.sizeBytes)}`} />}
        <Link to="/map" className="btn accent" style={{ alignSelf: 'flex-start' }}>
          Open Map
        </Link>
      </>
    )
  },
}
