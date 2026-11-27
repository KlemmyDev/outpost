import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanUrl, parseForecast, parseHistory, parseLive, parseSystem } from '#/features/power/client.server'
import { hoursLabel, kw, runtime } from '#/features/power/runtime'
import { PowerService } from '#/features/power/server'
import type { ForecastHour, PowerNow, PowerSystem } from '#/features/power/types'
import { openDatabase } from '#/platform/server/db.server'
import { SettingsStore } from '#/platform/server/settings.server'
import type { NotifyInput } from '#/platform/notifications.types'

const T0 = Date.parse('2026-11-27T18:00:00+10:00')
const H = 3_600_000

function now(over: Partial<PowerNow> = {}): PowerNow {
  return {
    at: T0,
    solarW: 0,
    homeW: 1000,
    gridW: 0,
    batteryW: 1000,
    batteryPct: 60,
    batteryTempC: 24,
    gridVoltage: 240,
    offGrid: false,
    offGridSince: null,
    today: { solarKwh: 20, importKwh: 0, exportKwh: 5, chargeKwh: 8, dischargeKwh: 3 },
    ...over,
  }
}
const SYS: PowerSystem = { model: 'SH5.0RS', pvKw: 6.6, batteryKwh: 10, reservePct: 10, batteryMaxKw: 5 }

describe('off-grid runtime', () => {
  it('divides the energy above the reserve by the draw', () => {
    const r = runtime(now(), SYS, [], 0.5)!
    expect(r.usableKwh).toBe(5) // (60 - 10)% of 10 kWh
    expect(r.atThisRateH).toBe(5) // 5 kWh at 1 kW
    expect(r.usualNightH).toBe(10) // 5 kWh at 0.5 kW
    expect(r.withForecastUntil).toBeNull()
  })

  it('says solar covers the house when it does', () => {
    expect(runtime(now({ solarW: 3000, homeW: 800 }), SYS, [], null)!.atThisRateH).toBeNull()
  })

  it('walks the forecast hour by hour and finds when the reserve is reached', () => {
    // 2 kW all night, no solar: 5 kWh lasts 2.5 hours.
    const hours: ForecastHour[] = Array.from({ length: 12 }, (_, i) => ({ t: T0 + i * H, solarKw: 0, homeKw: 2, soc: null, code: null }))
    const r = runtime(now(), SYS, hours, null)!
    expect(r.withForecastUntil).toBe(T0 + 2.5 * H)
    expect(r.forecastEnd).toBeNull()
    expect(r.forecastLowPct).toBe(10)
  })

  it('lasts the forecast when solar refills it, and never goes past full', () => {
    const hours: ForecastHour[] = Array.from({ length: 24 }, (_, i) => ({ t: T0 + i * H, solarKw: i >= 12 && i < 20 ? 4 : 0, homeKw: 0.4, soc: null, code: null }))
    const r = runtime(now(), SYS, hours, null)!
    expect(r.withForecastUntil).toBeNull()
    expect(r.forecastEnd).toBe(T0 + 24 * H)
    // 12 hours at 0.4 kW takes 4.8 kWh from 6: lowest is 1.2 kWh = 12%.
    expect(r.forecastLowPct).toBe(12)
  })

  it('needs a battery', () => {
    expect(runtime(now({ batteryPct: null }), SYS, [], null)).toBeNull()
    expect(runtime(now(), { ...SYS, batteryKwh: null }, [], null)).toBeNull()
  })

  it('reads times and power nicely', () => {
    expect(hoursLabel(0.5)).toBe('30 min')
    expect(hoursLabel(3.33)).toBe('3 h 20 min')
    expect(hoursLabel(52)).toBe('2 days 4 h')
    expect(kw(526)).toBe('0.5 kW')
    expect(kw(-3240)).toBe('3.2 kW')
  })
})

describe("reading WattsMyPower's API", () => {
  const LIVE = {
    snapshot: { ts: 1795778972, pv_power: 0, load_power: 526, grid_power: 0, battery_power: 526, battery_soc: 65.8, battery_temp: 24, grid_voltage: 241.2, daily_pv: 35.9, daily_import: 0, daily_export: 18.7, daily_charge: 9.9, daily_discharge: 8.5 },
    off_grid: null,
    battery_mode: { min_soc: 5 },
  }

  it('reads the live reading', () => {
    expect(parseLive(LIVE)).toMatchObject({ at: 1795778972000, homeW: 526, batteryPct: 65.8, offGrid: false, today: { solarKwh: 35.9, exportKwh: 18.7 } })
    expect(parseLive({ ...LIVE, off_grid: true, off_grid_since: 1795778000 }).offGridSince).toBe(1795778000000)
  })

  it('reads the system, falling back to the live reserve', () => {
    expect(parseSystem({ system: { model: 'SH5.0RS', pv_kw: 6.6, battery_kwh: 16, battery_reserve: 5 } })).toMatchObject({ batteryKwh: 16, reservePct: 5 })
    expect(parseSystem({}, LIVE).reservePct).toBe(5)
  })

  it('reads the forecast, with the home’s average draw', () => {
    const f = parseForecast({
      hours: [{ ts: 1795780800, pv_kw: 0, load_kw: 0.44, soc: 61.4, code: 51 }],
      days: [{ date: '2026-11-28', pv_kwh: 23.99, load_kwh: 16.86, min_soc: 40, max_soc: 100, code: 3, temp_max: 29 }],
      summary: { full_at: 1795831722 },
      load_basis: { days: [{ kwh: 24 }, { kwh: 12 }] },
    })
    expect(f.hours[0]).toMatchObject({ t: 1795780800000, homeKw: 0.44 })
    expect(f.days[0]).toMatchObject({ solarKwh: 23.99, minSoc: 40 })
    expect(f.fullAt).toBe(1795831722000)
    expect(f.averageHomeKw).toBe(0.75)
  })

  it('reads history', () => {
    const h = parseHistory({ series: { t: [1, 2], pv_power: [0, 101.3], load_power: [500, null], battery_soc: [60, 61] } })
    expect(h).toEqual({ t: [1000, 2000], solarW: [0, 101.3], homeW: [500, null], batteryPct: [60, 61], gridW: [] })
  })

  it('tidies addresses', () => {
    expect(cleanUrl('192.168.1.40:8080/')).toBe('http://192.168.1.40:8080')
    expect(cleanUrl('https://power.lan')).toBe('https://power.lan')
    expect(() => cleanUrl('ftp://x')).toThrow()
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-pwr-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('following WattsMyPower', () => {
  function setup() {
    const db = openDatabase(join(dir, 'o.db'))
    const settings = new SettingsStore(db)
    const sent: Omit<NotifyInput, 'feature'>[] = []
    let offGrid = false
    let soc = 50
    let key = 'wmp_goodkey1234567890'
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('authorization')
      if (auth !== `Bearer ${key}`) return new Response('{"detail":"no"}', { status: 401 })
      const path = String(input).split('/api/v1/')[1]!
      const body =
        path === 'ping'
          ? { app: 'WattsMyPower', key: { name: 'Outpost', scopes: ['live:read', 'history:read', 'forecast:read', 'system:read'] }, inverter_fresh: true }
          : path === 'live'
            ? { snapshot: { ts: Date.now() / 1000, pv_power: 0, load_power: 1000, battery_power: 1000, battery_soc: soc }, off_grid: offGrid }
            : path === 'system'
              ? { system: { model: 'SH5.0RS', battery_kwh: 10, battery_reserve: 10 } }
              : path === 'forecast'
                ? { hours: [], days: [] }
                : {}
      return Response.json(body)
    }) as typeof fetch
    const svc = new PowerService({ db, settings, notify: (n) => void sent.push(n), log: () => {} }, fetchImpl)
    return {
      svc,
      sent,
      setGrid: (v: boolean) => (offGrid = v),
      setSoc: (v: number) => (soc = v),
      rotateKey: () => (key = 'wmp_otherkey0987654321'),
    }
  }

  it('connects with a key, and refuses a bad one', async () => {
    const { svc } = setup()
    await expect(svc.save({ url: '10.0.0.5:8080', key: 'not-a-key' })).rejects.toThrow(/start with wmp_/)
    await expect(svc.save({ url: '10.0.0.5:8080', key: 'wmp_wrongkey000000000' })).rejects.toThrow(/didn't accept the key/)
    const d = await svc.save({ url: '10.0.0.5:8080', key: 'wmp_goodkey1234567890' })
    expect(d).toMatchObject({ state: 'ok', hasKey: true, settings: { url: 'http://10.0.0.5:8080' } })
    expect(d.runtime?.atThisRateH).toBe(4)
    expect(JSON.stringify(d)).not.toContain('wmp_goodkey')
  })

  it('notifies when the grid goes down, when the battery runs low, and when the grid is back', async () => {
    const { svc, sent, setGrid, setSoc } = setup()
    await svc.save({ url: '10.0.0.5:8080', key: 'wmp_goodkey1234567890' })
    setGrid(true)
    await svc.poll()
    expect(sent.at(-1)).toMatchObject({ level: 'alert', title: 'The grid is down' })
    setSoc(20)
    await svc.poll()
    expect(sent.at(-1)?.title).toBe('Battery at 20% with no grid')
    await svc.poll()
    expect(sent.filter((n) => n.title.startsWith('Battery')).length).toBe(1)
    setGrid(false)
    await svc.poll()
    expect(sent.at(-1)).toMatchObject({ level: 'info', title: 'The grid is back' })
  })

  it('reports a key that stops working', async () => {
    const { svc, rotateKey } = setup()
    await svc.save({ url: '10.0.0.5:8080', key: 'wmp_goodkey1234567890' })
    rotateKey()
    await svc.poll()
    expect(svc.data()).toMatchObject({ state: 'error', error: expect.stringMatching(/didn't accept the key/) })
  })
})
