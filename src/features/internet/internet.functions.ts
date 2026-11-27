import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { monthlySpeedTestGB } from './analyze'
import { getMonitor } from './server'
import { RANGES, type InternetSettings, type Range } from './types'

function monitorOrThrow() {
  if (!getPlatform().features.isEnabled('internet')) throw new Error('The Internet feature is switched off.')
  const monitor = getMonitor()
  if (!monitor) throw new Error('The Internet monitor is still starting. Try again in a moment.')
  return monitor
}

export const getInternetDashboard = createServerFn({ method: 'GET' })
  .validator((data: { range?: string }) => ({ range: (RANGES as readonly string[]).includes(data?.range ?? '') ? (data.range as Range) : '24h' }))
  .handler(async ({ data }) => {
    const monitor = monitorOrThrow()
    const settings = monitor.settings()
    return { status: monitor.status(), stats: monitor.stats(data.range), settings, monthlyGB: monthlySpeedTestGB(settings) }
  })

export const saveInternetSettings = createServerFn({ method: 'POST' })
  .validator((data: Partial<InternetSettings>) => data)
  .handler(async ({ data }) => {
    const settings = monitorOrThrow().saveSettings(data)
    return { settings, monthlyGB: monthlySpeedTestGB(settings) }
  })

export const runProbe = createServerFn({ method: 'POST' }).handler(async () => monitorOrThrow().probeNow())

export const runSpeedTest = createServerFn({ method: 'POST' }).handler(async () => monitorOrThrow().speedTestNow())
