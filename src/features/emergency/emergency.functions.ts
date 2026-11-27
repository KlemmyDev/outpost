import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { getEmergency } from './server'
import type { EmergencyData, EmergencySettings, Kit, KitItem, Plan } from './types'

async function svc() {
  if (!getPlatform().features.isEnabled('emergency')) throw new Error('Emergency is switched off.')
  let s = getEmergency()
  if (!s) {
    await getPlatform().runtime.settled()
    s = getEmergency()
  }
  if (!s) throw new Error('Emergency is still starting. Try again in a moment.')
  return s
}

export const getEmergencyData = createServerFn({ method: 'GET' }).handler(async (): Promise<EmergencyData> => (await svc()).data())

export const checkWarnings = createServerFn({ method: 'POST' }).handler(async (): Promise<EmergencyData> => {
  const s = await svc()
  await s.poll()
  return s.data()
})

export const saveEmergencySettings = createServerFn({ method: 'POST' })
  .validator((d: Partial<EmergencySettings>) => d ?? {})
  .handler(async ({ data }): Promise<EmergencyData> => {
    const s = await svc()
    s.saveSettings(data)
    await s.poll()
    return s.data()
  })

export const savePlan = createServerFn({ method: 'POST' })
  .validator((d: Partial<Plan>) => d ?? {})
  .handler(async ({ data }): Promise<Plan> => (await svc()).savePlan(data))

export const saveKit = createServerFn({ method: 'POST' })
  .validator((d: { items: Partial<KitItem>[] }) => ({ items: Array.isArray(d?.items) ? d.items : [] }))
  .handler(async ({ data }): Promise<Kit> => (await svc()).saveKit(data.items))
