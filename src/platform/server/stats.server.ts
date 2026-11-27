import { readFileSync, statfsSync } from 'node:fs'
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os'
import type { ServerStats } from '#/platform/overview.types'
import type { Platform } from './platform.server'

function readNumber(path: string): number | null {
  try {
    const n = Number(readFileSync(path, 'utf8').trim())
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Memory as people mean it. os.freemem() counts the disk cache as used, which
 * makes a healthy Linux server look full, so prefer MemAvailable from
 * /proc/meminfo, and a cgroup memory limit when the container has one.
 */
export function readMemory(): { totalBytes: number; freeBytes: number } {
  let total = totalmem()
  let free = freemem()
  try {
    const info = readFileSync('/proc/meminfo', 'utf8')
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(info)?.[1] ?? NaN) * 1024
    if (Number.isFinite(kb('MemTotal'))) total = kb('MemTotal')
    if (Number.isFinite(kb('MemAvailable'))) free = kb('MemAvailable')
  } catch {
    // Not Linux: keep what os gave us.
  }
  const limit = readNumber('/sys/fs/cgroup/memory.max')
  const current = readNumber('/sys/fs/cgroup/memory.current')
  if (limit && limit < total && current) {
    total = limit
    free = Math.max(0, limit - current)
  }
  return { totalBytes: total, freeBytes: Math.min(free, total) }
}

/** What the Home server card shows. Read fresh on each request; it's cheap. */
export function serverStats(p: Platform): ServerStats {
  let disk: ServerStats['disk'] = null
  try {
    const fs = statfsSync(p.config.dataDir)
    disk = { totalBytes: fs.blocks * fs.bsize, freeBytes: fs.bavail * fs.bsize }
  } catch {
    disk = null
  }
  const updates = p.updates.status()
  const features = p.features.list().filter((f) => !f.core)
  return {
    version: p.version.version,
    release: p.version.release,
    commit: p.version.commit,
    channel: updates.channel,
    updateAvailable: updates.available,
    latestVersion: updates.latest?.version ?? null,
    appUptimeSec: Math.round((Date.now() - p.startedAt) / 1000),
    hostUptimeSec: Math.round(uptime()),
    cpuCount: cpus().length,
    load1: Math.round(loadavg()[0]! * 100) / 100,
    memory: readMemory(),
    disk,
    features: { on: features.filter((f) => f.enabled).length, total: features.length },
  }
}
