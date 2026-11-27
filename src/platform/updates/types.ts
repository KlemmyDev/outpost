import type { Channel } from './channels'
import type { InstallerStatus } from './protocol'

/** Shared between the server and the UI. No Node imports here. */
export interface LatestRelease {
  version: string
  release: string | null
  commit: string
  tag: string | null
  date: string | null
  /** Changes between this install and the target, when GitHub could tell us. */
  changes: number | null
  ahead: number | null
  behind: number | null
}

/** "update": the target is newer. "older": following this channel goes back in time. */
export type UpdateMove = 'update' | 'older' | null

export interface UpdateStatus {
  autoCheck: boolean
  channel: Channel
  current: { version: string; release: string | null; commit: string }
  latest: LatestRelease | null
  move: UpdateMove
  available: boolean
  checkedAt: number | null
  error: string | null
  repo: string
  install: InstallerStatus
}
