import type { InternetStatus } from '#/features/internet/types'
import type { LibraryStatus } from '#/features/library/types'
import type { MapStatus } from '#/features/map/types'
import type { MessagesStatus } from '#/features/messages/types'
import type { PowerStatus } from '#/features/power/types'
import type { FirstAidStatus } from '#/features/first-aid/types'

/** Shared between the server and the Overview UI. No Node imports. */

/**
 * Live data behind each feature's Overview card, keyed by feature id. A
 * feature that has some adds its entry here and a loader in
 * src/platform/server/widgets.server.ts. Missing means the feature is off;
 * null means its loader failed.
 */
export interface WidgetData {
  internet?: InternetStatus | null
  library?: LibraryStatus | null
  map?: MapStatus | null
  messages?: MessagesStatus | null
  power?: PowerStatus | null
  'first-aid'?: FirstAidStatus | null
}

export interface ServerStats {
  version: string
  release: string | null
  commit: string
  channel: string
  updateAvailable: boolean
  latestVersion: string | null
  appUptimeSec: number
  hostUptimeSec: number
  cpuCount: number
  load1: number
  memory: { totalBytes: number; freeBytes: number }
  disk: { totalBytes: number; freeBytes: number } | null
  features: { on: number; total: number }
}

export interface OverviewData {
  server: ServerStats
  widgets: WidgetData
}
