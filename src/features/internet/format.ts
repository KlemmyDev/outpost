import type { NetEvent } from './types'

export function lastedLabel(e: Pick<NetEvent, 'kind' | 'startedAt' | 'endedAt'>, now = Date.now()): string {
  if (e.kind === 'slow') return 'One test'
  const end = e.endedAt ?? now
  const mins = Math.max(1, Math.round((end - e.startedAt) / 60_000))
  const span = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`
  return e.endedAt === null ? `Ongoing · ${span}` : span
}
