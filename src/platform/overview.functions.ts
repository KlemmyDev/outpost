import { createServerFn } from '@tanstack/react-start'
import type { OverviewData } from './overview.types'
import { getPlatform } from './server/platform.server'
import { serverStats } from './server/stats.server'
import { loadWidgets } from './server/widgets.server'

export const getOverviewData = createServerFn({ method: 'GET' }).handler(async (): Promise<OverviewData> => {
  const p = getPlatform()
  return { server: serverStats(p), widgets: await loadWidgets(p) }
})
