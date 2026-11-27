import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CHANNEL, isChannel, type Channel } from './channels'

/**
 * The app never touches Docker or the code. Updating is done by updater.sh on
 * the host, which runs from cron every minute. The two sides talk only through
 * files in `data/update/`, which the container sees as `/data/update/`:
 *
 *   channel       both     the release channel to follow
 *   request       app      "please update"; only its existence and time matter
 *   updater.json  updater  heartbeat every minute: {seen_at, can_update, why}
 *   status.json   updater  {state, requested_at, started_at, finished_at, from, to, error}
 *   update.log    updater  output of `install.sh --yes`
 *   previous      install  what to roll back to: commit=, version=, backup=, when=
 *
 * Every file is written whole (temp file, then rename), so neither side ever
 * reads half a file.
 */
export const FILES = {
  channel: 'channel',
  request: 'request',
  heartbeat: 'updater.json',
  status: 'status.json',
  log: 'update.log',
  previous: 'previous',
} as const

/** The updater runs every minute; after this long without a heartbeat it's gone. */
export const UPDATER_GONE_SECONDS = 180
/** updater.sh ignores requests older than this (see STALE_REQUEST in updater.sh). */
export const STALE_REQUEST_SECONDS = 900
/** How long a finished update stays on screen. */
export const RECENT_SECONDS = 15 * 60
/** Log lines shown while an update runs or after it fails. */
export const LOG_TAIL_LINES = 12

export type InstallState = 'idle' | 'requested' | 'running' | 'done' | 'failed' | 'expired'

export interface InstallerStatus {
  /** The host updater is alive and able to update. */
  ready: boolean
  /** Why it can't update, in plain words, when `ready` is false. */
  why: string | null
  state: InstallState
  requestedAt: number | null
  startedAt: number | null
  finishedAt: number | null
  from: string | null
  to: string | null
  error: string | null
  log: string[]
}

interface Heartbeat {
  seen_at?: number
  can_update?: boolean
  why?: string
}

interface StatusFile {
  state?: string
  requested_at?: number
  started_at?: number
  finished_at?: number
  from?: string
  to?: string
  error?: string
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

export function tailLog(path: string, lines = LOG_TAIL_LINES): string[] {
  try {
    return readFileSync(path, 'utf8')
      .replace(ANSI, '')
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '')
      .slice(-lines)
  } catch {
    return []
  }
}

/** Reads the protocol files into one status. `now` is in Unix seconds. */
export function readInstaller(dir: string, now: number): InstallerStatus {
  const beat = readJson<Heartbeat>(join(dir, FILES.heartbeat))
  const status = readJson<StatusFile>(join(dir, FILES.status))
  const requestPath = join(dir, FILES.request)

  const alive = typeof beat?.seen_at === 'number' && now - beat.seen_at <= UPDATER_GONE_SECONDS
  let why: string | null = null
  if (!beat) why = "The updater isn't set up on this server. Run install.sh on the host to set it up."
  else if (!alive) why = "The updater on the host hasn't checked in for a few minutes. Is cron running?"
  else if (!beat.can_update) why = beat.why || "The updater can't update right now."
  const ready = alive && beat?.can_update === true

  let state: InstallState = 'idle'
  let requestedAt: number | null = null
  if (existsSync(requestPath)) {
    state = 'requested'
    requestedAt = Math.floor(statSync(requestPath).mtimeMs / 1000)
  } else if (status?.state) {
    const s = status.state as InstallState
    const finished = status.finished_at ?? status.started_at ?? 0
    if (s === 'running') state = 'running'
    else if (['done', 'failed', 'expired'].includes(s) && now - finished <= RECENT_SECONDS) state = s
  }

  return {
    ready,
    why: ready ? null : why,
    state,
    requestedAt: requestedAt ?? status?.requested_at ?? null,
    startedAt: status?.started_at ?? null,
    finishedAt: status?.finished_at ?? null,
    from: status?.from ?? null,
    to: status?.to ?? null,
    error: state === 'failed' || state === 'expired' ? (status?.error ?? null) : null,
    log: state === 'running' || state === 'failed' ? tailLog(join(dir, FILES.log)) : [],
  }
}

/** Writes a file whole: to a temp file first, then renamed into place. */
export function writeAtomic(path: string, contents: string, mode = 0o644): void {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, contents)
  chmodSync(tmp, mode)
  renameSync(tmp, path)
}

export function readChannel(dir: string): Channel {
  try {
    const value = readFileSync(join(dir, FILES.channel), 'utf8').trim()
    return isChannel(value) ? value : DEFAULT_CHANNEL
  } catch {
    return DEFAULT_CHANNEL
  }
}

export function writeChannel(dir: string, channel: Channel): void {
  mkdirSync(dir, { recursive: true })
  writeAtomic(join(dir, FILES.channel), `${channel}\n`)
}

export function writeRequest(dir: string, now: number): void {
  mkdirSync(dir, { recursive: true })
  writeAtomic(join(dir, FILES.request), `${now}\n`)
}
