import { compareVersions, newestTag, type Channel } from '#/platform/updates/channels'
import { countChanges, type CompareCommit } from '#/platform/updates/changes'
import { readChannel, readInstaller, writeChannel, writeRequest } from '#/platform/updates/protocol'
import type { LatestRelease, UpdateMove, UpdateStatus } from '#/platform/updates/types'
import type { Config } from './config.server'
import type { SettingsStore } from './settings.server'
import type { VersionInfo } from './version.server'

const FIRST_CHECK_MS = 60_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const STATE_KEY = 'updates.state'
const AUTO_KEY = 'updates.auto_check'

export class UpdateRefused extends Error {
  readonly status = 409
}

class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** "api" for the REST API, "file" for a raw file such as package.json. */
    readonly source: 'api' | 'file' = 'api',
  ) {
    super(message)
  }
}

interface SavedState {
  latest: LatestRelease | null
  checkedAt: number | null
  error: string | null
}

const now = () => Math.floor(Date.now() / 1000)

export class UpdateService {
  private state: SavedState
  private timer: ReturnType<typeof setTimeout> | null = null
  private checking: Promise<void> | null = null

  constructor(
    private readonly config: Config,
    private readonly settings: SettingsStore,
    private readonly version: VersionInfo,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.state = settings.getJson<SavedState>(STATE_KEY) ?? { latest: null, checkedAt: null, error: null }
  }

  /** Checks 60 s after start, then every 6 hours, while auto-check is on. */
  start(): void {
    if (this.timer) return
    const tick = (delay: number) => {
      this.timer = setTimeout(async () => {
        if (this.autoCheck) await this.check().catch(() => {})
        tick(CHECK_EVERY_MS)
      }, delay)
      this.timer.unref?.()
    }
    tick(FIRST_CHECK_MS)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  get autoCheck(): boolean {
    return this.settings.getBool(AUTO_KEY, true)
  }

  setAutoCheck(on: boolean): UpdateStatus {
    this.settings.setBool(AUTO_KEY, on)
    return this.status()
  }

  get channel(): Channel {
    return readChannel(this.config.updateDir)
  }

  async setChannel(channel: Channel): Promise<UpdateStatus> {
    writeChannel(this.config.updateDir, channel)
    await this.check()
    return this.status()
  }

  status(): UpdateStatus {
    const move = this.move()
    return {
      autoCheck: this.autoCheck,
      channel: this.channel,
      current: { ...this.version },
      latest: this.state.latest,
      move,
      available: move === 'update',
      checkedAt: this.state.checkedAt,
      error: this.state.error,
      repo: this.config.repo,
      install: readInstaller(this.config.updateDir, now()),
    }
  }

  /** Asks the host updater to install the channel's latest version. */
  requestInstall(): UpdateStatus {
    const install = readInstaller(this.config.updateDir, now())
    if (!install.ready) throw new UpdateRefused(install.why ?? "The updater isn't ready.")
    if (install.state === 'requested' || install.state === 'running') {
      throw new UpdateRefused('An update is already on its way.')
    }
    writeRequest(this.config.updateDir, now())
    return this.status()
  }

  /** Checks GitHub. Concurrent calls share one check. */
  check(): Promise<void> {
    this.checking ??= this.runCheck().finally(() => {
      this.checking = null
    })
    return this.checking
  }

  private async runCheck(): Promise<void> {
    const channel = this.channel
    try {
      const target = channel === 'nightly' ? await this.nightlyTarget() : await this.taggedTarget(channel)
      if (!target) {
        this.save({ latest: null, error: `No ${channel} release has been published yet.` })
        return
      }
      const latest: LatestRelease = { ...target, changes: null, ahead: null, behind: null }
      const { commit } = this.version
      if (commit && commit !== target.commit) {
        const cmp = await this.gh<{ ahead_by: number; behind_by: number; commits: CompareCommit[] }>(
          `/compare/${commit}...${target.commit}`,
          { allow404: true },
        )
        if (cmp) {
          latest.ahead = cmp.ahead_by
          latest.behind = cmp.behind_by
          latest.changes = countChanges(cmp.commits, target.commit)
        }
      } else if (commit === target.commit) {
        latest.ahead = 0
        latest.behind = 0
        latest.changes = 0
      }
      this.save({ latest, error: null })
    } catch (err) {
      this.save({ latest: this.state.latest, error: describe(err) })
    }
  }

  private save(partial: Omit<SavedState, 'checkedAt'>): void {
    this.state = { ...partial, checkedAt: now() }
    this.settings.setJson(STATE_KEY, this.state)
  }

  private move(): UpdateMove {
    const latest = this.state.latest
    if (!latest || latest.commit === this.version.commit) return null
    if (latest.ahead !== null && latest.ahead > 0) return 'update'
    if (latest.behind !== null && latest.behind > 0) return 'older'
    // GitHub couldn't compare (an unknown local build): go by version number.
    const byVersion = compareVersions(latest.version, this.version.version)
    if (byVersion < 0) return 'older'
    return 'update'
  }

  private async nightlyTarget() {
    const head = await this.gh<{ sha: string; commit: { committer: { date: string } } }>('/commits/main')
    const pkg = await this.raw<{ version?: string; outpost?: { release?: string } }>(head.sha, 'package.json')
    return {
      version: pkg.version ?? '0.0.0',
      release: pkg.outpost?.release || null,
      commit: head.sha,
      tag: null,
      date: head.commit.committer.date,
    }
  }

  private async taggedTarget(channel: 'beta' | 'stable') {
    const tags = await this.gh<{ name: string; commit: { sha: string } }[]>('/tags?per_page=100')
    const best = newestTag(
      tags.map((t) => t.name),
      channel,
    )
    if (!best) return null
    const sha = tags.find((t) => t.name === best.name)!.commit.sha
    return { version: best.version, release: best.beta ? 'beta' : null, commit: sha, tag: best.name, date: null }
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'outpost-updater',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (this.config.githubToken) h.Authorization = `Bearer ${this.config.githubToken}`
    return h
  }

  private async gh<T>(path: string, opts: { allow404: true }): Promise<T | null>
  private async gh<T>(path: string): Promise<T>
  private async gh<T>(path: string, opts?: { allow404?: boolean }): Promise<T | null> {
    const res = await this.fetchImpl(`https://api.github.com/repos/${this.config.repo}${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404 && opts?.allow404) return null
    if (!res.ok) throw new GitHubError(`GitHub answered ${res.status}`, res.status)
    return (await res.json()) as T
  }

  private async raw<T>(sha: string, file: string): Promise<T> {
    const res = await this.fetchImpl(`https://raw.githubusercontent.com/${this.config.repo}/${sha}/${file}`, {
      headers: { 'User-Agent': 'outpost-updater' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new GitHubError(`GitHub answered ${res.status}`, res.status, 'file')
    return (await res.json()) as T
  }
}

function describe(err: unknown): string {
  if (err instanceof GitHubError) {
    if (err.status === 403 || err.status === 429) return "GitHub's rate limit was reached. Outpost will try again later."
    if (err.status === 404 && err.source === 'file') return "The newest code on GitHub isn't an Outpost release yet."
    if (err.status === 404) return "Couldn't find the update repository on GitHub."
    return `GitHub had a problem (${err.status}). Outpost will try again later.`
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'GitHub took too long to answer. Is the internet slow or down?'
  }
  return "Couldn't reach GitHub. Is the internet up?"
}
