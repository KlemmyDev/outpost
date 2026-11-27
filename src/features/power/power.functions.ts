import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { getPower } from './server'
import type { HistorySeries, PowerData, PowerSettings } from './types'

async function svc() {
  if (!getPlatform().features.isEnabled('power')) throw new Error('Power is switched off.')
  let s = getPower()
  if (!s) {
    await getPlatform().runtime.settled()
    s = getPower()
  }
  if (!s) throw new Error('Power is still starting. Try again in a moment.')
  return s
}

export const getPowerData = createServerFn({ method: 'GET' }).handler(async (): Promise<PowerData> => (await svc()).data())

/** The page's refresh: polls WattsMyPower now rather than waiting for the next tick. */
export const refreshPower = createServerFn({ method: 'POST' }).handler(async (): Promise<PowerData> => {
  const s = await svc()
  await s.poll()
  return s.data()
})

export const getPowerHistory = createServerFn({ method: 'GET' })
  .validator((d: { range?: string }) => ({ range: d?.range === '7d' ? ('7d' as const) : ('24h' as const) }))
  .handler(async ({ data }): Promise<HistorySeries> => (await svc()).history(data.range))

export const savePowerSettings = createServerFn({ method: 'POST' })
  .validator((d: Partial<PowerSettings> & { key?: string }) => ({
    ...(typeof d?.url === 'string' ? { url: d.url.slice(0, 300) } : {}),
    ...(typeof d?.key === 'string' ? { key: d.key.slice(0, 200) } : {}),
    ...(typeof d?.notifyGrid === 'boolean' ? { notifyGrid: d.notifyGrid } : {}),
    ...(typeof d?.lowBatteryPct === 'number' ? { lowBatteryPct: d.lowBatteryPct } : {}),
  }))
  .handler(async ({ data }): Promise<PowerData> => (await svc()).save(data))

export const disconnectPower = createServerFn({ method: 'POST' }).handler(async (): Promise<PowerData> => {
  const s = await svc()
  s.forget()
  return s.data()
})
