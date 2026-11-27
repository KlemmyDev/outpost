import type { ForecastHour, PowerNow, PowerSystem, Runtime } from './types'

/** Below this the house is effectively idle; runtime "at this rate" would be meaningless. */
const MIN_DRAW_KW = 0.05

/**
 * How long the battery would keep the house going if the grid went now.
 *
 * - At this rate: usable energy over the net draw right now (home minus solar).
 * - Through a usual night: usable energy over the home's average draw, no solar.
 * - With the forecast: hour by hour through WattsMyPower's forecast of solar
 *   and home use, starting from the battery's level now, charging from spare
 *   solar up to full and stopping at the reserve. Without the grid nothing is
 *   exported or imported, so that's all there is.
 */
export function runtime(now: PowerNow, system: PowerSystem, forecast: ForecastHour[], averageHomeKw: number | null): Runtime | null {
  if (now.batteryPct === null || !system.batteryKwh) return null
  const cap = system.batteryKwh
  const reserve = system.reservePct
  const usable = Math.max(0, ((now.batteryPct - reserve) / 100) * cap)

  const netKw = (now.homeW - now.solarW) / 1000
  const atThisRateH = netKw > MIN_DRAW_KW ? usable / netKw : null
  const usualNightH = averageHomeKw && averageHomeKw > MIN_DRAW_KW ? usable / averageHomeKw : null

  let withForecastUntil: number | null = null
  let forecastEnd: number | null = null
  let low: number | null = null
  const hours = forecast.filter((h) => h.t + 3600 * 1000 > now.at).sort((a, b) => a.t - b.t)
  if (hours.length) {
    let kwh = (now.batteryPct / 100) * cap
    const floor = (reserve / 100) * cap
    let lowKwh = kwh
    for (const h of hours) {
      // The first hour may be partly gone.
      const start = Math.max(h.t, now.at)
      const end = h.t + 3600 * 1000
      const frac = Math.max(0, (end - start) / 3_600_000)
      const net = (h.homeKw - h.solarKw) * frac
      if (net > 0 && kwh - net <= floor) {
        // Runs down part way through this hour.
        const left = kwh - floor
        withForecastUntil = Math.round(start + (left / (h.homeKw - h.solarKw)) * 3_600_000)
        lowKwh = floor
        break
      }
      kwh = Math.min(cap, kwh - net)
      lowKwh = Math.min(lowKwh, kwh)
      forecastEnd = end
    }
    low = Math.round((lowKwh / cap) * 100)
    if (withForecastUntil !== null) forecastEnd = null
  }

  return {
    usableKwh: Math.round(usable * 10) / 10,
    atThisRateH: atThisRateH === null ? null : Math.round(atThisRateH * 10) / 10,
    usualNightH: usualNightH === null ? null : Math.round(usualNightH * 10) / 10,
    withForecastUntil,
    forecastEnd,
    forecastLowPct: low,
  }
}

/** "3 h 20 min", "45 min", "2 days 4 h". */
export function hoursLabel(h: number): string {
  if (h >= 48) return `${Math.floor(h / 24)} days ${Math.round(h % 24)} h`
  if (h >= 1) {
    const whole = Math.floor(h)
    const min = Math.round((h - whole) * 60 / 5) * 5
    return min === 60 ? `${whole + 1} h` : min ? `${whole} h ${min} min` : `${whole} h`
  }
  return `${Math.max(1, Math.round(h * 60))} min`
}

/** kW with one decimal under 10, whole above: "0.5 kW", "3.2 kW", "12 kW". */
export function kw(w: number): string {
  const v = Math.abs(w) / 1000
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} kW`
}
