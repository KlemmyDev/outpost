import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expiringSoon } from '#/features/emergency/kit'
import { cleanKit, cleanPlan } from '#/features/emergency/server'
import { arrange, parseBom, parseQfd, parseRfs, parseVic, pointOf, severeWeather, stateAt } from '#/features/emergency/warnings.server'
import type { Warning } from '#/features/emergency/types'

const BOM = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel><title>Weather Warnings for Queensland</title>
<item><title>27/11:36 EST Minor Flood Warning for the Paroo River (QLD)</title><link>http://reg.bom.gov.au/qld/warnings/flood/paroo-river.shtml</link><pubDate>Fri, 27 Nov 2026 01:36:37 GMT</pubDate><guid>http://reg.bom.gov.au/qld/warnings/flood/paroo-river.shtml</guid></item>
<item><title>27/14:05 EST Severe Thunderstorm Warning for people in South East Queensland</title><link>http://reg.bom.gov.au/qld/warnings/storm.shtml</link><pubDate>Fri, 27 Nov 2026 04:05:00 GMT</pubDate><guid>storm</guid></item>
</channel></rss>`

const QFD = {
  features: [
    { geometry: { type: 'Polygon', coordinates: [[[145, -17], [146, -17], [146, -18], [145, -18]]] }, properties: { UniqueID: 'WARN-1', WarningTitle: 'AVOID SMOKE - Wongabel', WarningLevel: 'Advice', CallToAction: 'Avoid Smoke', Latitude: '-17.3', Longitude: '145.46', ItemDateTimeLocal_ISO: '2026-11-27T15:30:53+10:00' } },
    { geometry: null, properties: { UniqueID: 'WARN-2', WarningTitle: 'Something else', WarningLevel: 'Information' } },
  ],
}
const RFS = {
  features: [
    {
      geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [150.82, -35.1] }, { type: 'Polygon', coordinates: [] }] },
      properties: { title: 'BEECROFT WEAPONS RANGE', category: 'Watch and Act', guid: 'g1', pubDate: '27/11/2026 7:22:00 AM', description: 'ALERT LEVEL: Watch and Act <br />STATUS: Being controlled <br />TYPE: Bush Fire <br />' },
    },
    { geometry: { type: 'Point', coordinates: [150, -34] }, properties: { title: 'X', category: 'Not Applicable', guid: 'g2' } },
  ],
}
const VIC = {
  features: [
    { geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [145.1, -36.6] }] }, properties: { feedType: 'warning', id: '43708', category1: 'Advice', cap: { event: 'Riverine Flood' }, location: 'the Goulburn River downstream of Seymour', action: 'Stay Informed', updated: '2026-11-27T13:49:40+11:00' } },
    { geometry: { type: 'Point', coordinates: [145, -37] }, properties: { feedType: 'incident', id: '9', category1: 'Fire' } },
  ],
}

describe('reading the warning feeds', () => {
  it('reads BOM’s RSS, without the time in the title', () => {
    const w = parseBom(BOM)
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ level: 'Weather', title: 'Minor Flood Warning for the Paroo River (QLD)', url: 'http://www.bom.gov.au/qld/warnings/flood/paroo-river.shtml' })
    expect(w[0]!.issued).toBe(Date.parse('2026-11-27T01:36:37Z'))
    expect(w.filter(severeWeather).map((x) => x.title)).toEqual(['Severe Thunderstorm Warning for people in South East Queensland'])
  })

  it('reads Queensland Fire Department warnings, with their coordinates', () => {
    const w = parseQfd(QFD)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ level: 'Advice', action: 'Avoid Smoke', lat: -17.3, lon: 145.46 })
  })

  it('reads NSW RFS incidents with an alert level', () => {
    const w = parseRfs(RFS)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ level: 'Watch and Act', title: 'Bush Fire: Beecroft Weapons Range', action: 'Being controlled', lat: -35.1, lon: 150.82 })
    expect(w[0]!.issued).toBe(Date.parse('2026-11-27T07:22:00+10:00'))
  })

  it('reads VicEmergency warnings, not incidents', () => {
    const w = parseVic(VIC)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ level: 'Advice', title: 'Riverine Flood: the Goulburn River downstream of Seymour', action: 'Stay Informed' })
  })

  it('finds the middle of a shape', () => {
    expect(pointOf({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] })).toEqual({ lat: 1, lon: 1 })
  })
})

describe('where home is', () => {
  it('works out the state', () => {
    expect(stateAt(-27.47, 153.03)).toBe('QLD') // Brisbane
    expect(stateAt(-33.87, 151.21)).toBe('NSW') // Sydney
    expect(stateAt(-35.28, 149.13)).toBe('ACT') // Canberra
    expect(stateAt(-37.81, 144.96)).toBe('VIC') // Melbourne
    expect(stateAt(-36.07, 146.92)).toBe('NSW') // Albury, just north of the Murray
    expect(stateAt(-36.12, 146.89)).toBe('VIC') // Wodonga, just south of it
    expect(stateAt(-35.11, 147.37)).toBe('NSW') // Wagga Wagga
    expect(stateAt(-42.88, 147.33)).toBe('TAS') // Hobart
    expect(stateAt(-34.93, 138.6)).toBe('SA') // Adelaide
    expect(stateAt(-31.95, 115.86)).toBe('WA') // Perth
    expect(stateAt(-12.46, 130.84)).toBe('NT') // Darwin
  })

  it('keeps warnings within the radius, most urgent first, and every BOM warning', () => {
    const home = { lat: -35, lon: 150.8 }
    const list: Warning[] = [...parseRfs(RFS), ...parseBom(BOM), { ...parseRfs(RFS)[0]!, id: 'far', level: 'Emergency Warning', lat: -30, lon: 150 }]
    const out = arrange(list, home, 50)
    // Fire warnings first; weather warnings newest first.
    expect(out.map((w) => w.id)).toEqual(['rfs:g1', 'bom:storm', 'bom:http://reg.bom.gov.au/qld/warnings/flood/paroo-river.shtml'])
    expect(out[0]!.distanceKm).toBeCloseTo(11.2, 0)
    expect(out.some((w) => w.id === 'far')).toBe(false)
  })
})

describe('plan and kit', () => {
  it('tidies the plan and drops empty people', () => {
    const p = cleanPlan({ people: [{ id: 'a', name: ' Mum ', phone: '0400 000 000', role: 'Household', medical: 'Penicillin allergy' }, { id: 'b', name: '', phone: '', role: '', medical: '' }], meetNear: 'Letterbox' })
    expect(p.people).toEqual([{ id: 'a', name: 'Mum', phone: '0400 000 000', role: 'Household', medical: 'Penicillin allergy' }])
    expect(p.meetNear).toBe('Letterbox')
    expect(p.updatedAt).toBeTypeOf('number')
  })

  it('tidies the kit and flags what expires soon', () => {
    const k = cleanKit([{ id: 'water', name: 'Water', have: true, expires: '2026-12-10' }, { name: '' }, { name: 'Torch', expires: 'soon' }])
    expect(k.map((x) => x.name)).toEqual(['Water', 'Torch'])
    expect(k[1]!.expires).toBeNull()
    const now = Date.parse('2026-11-27T12:00:00')
    expect(expiringSoon(k[0]!, now)).toBe(true)
    expect(expiringSoon({ ...k[0]!, expires: '2027-06-01' }, now)).toBe(false)
  })
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outpost-em-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('following warnings', () => {
  it('stays quiet about what was already there, then alerts on new nearby warnings and severe weather', async () => {
    const { openDatabase } = await import('#/platform/server/db.server')
    const { SettingsStore } = await import('#/platform/server/settings.server')
    const { EmergencyService } = await import('#/features/emergency/server')
    const db = openDatabase(join(dir, 'o.db'))
    const settings = new SettingsStore(db)
    const sent: { level: string; title: string }[] = []
    let rfs: typeof RFS = { features: [RFS.features[0]!] }
    let bom = BOM.replace(/<item><title>27\/14:05[\s\S]*?<\/item>/, '')
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = String(input)
      if (u.includes('bom.gov.au')) return new Response(bom)
      if (u.includes('rfs.nsw.gov.au')) return Response.json(rfs)
      return new Response('', { status: 404 })
    }) as typeof fetch
    const svc = new EmergencyService({ db, settings, notify: (n) => void sent.push(n), log: () => {} }, fetchImpl)
    vi.spyOn(svc, 'home').mockReturnValue({ lat: -35, lon: 150.8, name: 'Home' })

    await svc.poll()
    expect(svc.data().state).toBe('NSW')
    expect(svc.data().warnings.map((w) => w.level)).toEqual(['Watch and Act', 'Weather'])
    expect(sent).toEqual([])

    rfs = { features: [RFS.features[0]!, { ...RFS.features[0]!, properties: { ...RFS.features[0]!.properties, guid: 'g3', title: 'NEW FIRE', category: 'Emergency Warning' } }] } as typeof RFS
    bom = BOM
    await svc.poll()
    expect(sent.map((n) => n.title)).toEqual(['Emergency Warning: Bush Fire: New Fire', 'Severe Thunderstorm Warning for people in South East Queensland'])
    expect(sent[0]!.level).toBe('alert')

    await svc.poll()
    expect(sent).toHaveLength(2)
    expect(svc.widget()).toMatchObject({ near: 2, highest: 'Emergency Warning', weather: 2 })
  })

  it('keeps the last warnings when the services can’t be reached', async () => {
    const { openDatabase } = await import('#/platform/server/db.server')
    const { SettingsStore } = await import('#/platform/server/settings.server')
    const { EmergencyService } = await import('#/features/emergency/server')
    const db = openDatabase(join(dir, 'o.db'))
    let online = true
    const fetchImpl = (async (input: string | URL | Request) => {
      if (!online) throw new Error('offline')
      return String(input).includes('bom') ? new Response(BOM) : Response.json(RFS)
    }) as typeof fetch
    const svc = new EmergencyService({ db, settings: new SettingsStore(db), notify: () => {}, log: () => {} }, fetchImpl)
    vi.spyOn(svc, 'home').mockReturnValue({ lat: -35, lon: 150.8, name: 'Home' })
    await svc.poll()
    const before = svc.data().warnings.length
    online = false
    await svc.poll()
    expect(svc.data().warnings).toHaveLength(before)
    expect(svc.data().warningsError).toMatch(/last check/)
  })
})
