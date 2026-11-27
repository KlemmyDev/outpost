import { useRouter } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { monthlySpeedTestGB } from './analyze'
import { saveInternetSettings } from './internet.functions'
import { PROBE_INTERVALS, SPEED_TEST_SCHEDULES, type InternetSettings } from './types'

const intervalLabel = (s: number) => (s < 60 ? `Every ${s} seconds` : s === 60 ? 'Every minute' : `Every ${s / 60} minutes`)
const scheduleLabel = (h: number) => (h === 0 ? 'Off' : h === 1 ? 'Every hour' : h === 24 ? 'Once a day' : `Every ${h} hours`)

export function SettingsForm({ initial, monthlyGB }: { initial: InternetSettings; monthlyGB: number }) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const gb = monthlySpeedTestGB(form)

  const set = <K extends keyof InternetSettings>(key: K, value: InternetSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setState('idle')
  }

  async function save() {
    setState('saving')
    setError(null)
    try {
      const r = await saveInternetSettings({ data: form })
      setForm(r.settings)
      setState('saved')
      await router.invalidate()
    } catch (err) {
      setError((err as Error).message)
      setState('error')
    }
  }

  const field = (key: string) => `${id}-${key}`

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>Monitoring</h2>
        <span className="mono">SPEED TESTS USE ≈ {gb || monthlyGB} GB A MONTH</span>
      </div>

      <div className="form-grid">
        <label className="field" htmlFor={field('probe')}>
          <span>Check the connection</span>
          <select id={field('probe')} value={form.probeIntervalSec} onChange={(e) => set('probeIntervalSec', Number(e.target.value))}>
            {PROBE_INTERVALS.map((s) => (
              <option key={s} value={s}>
                {intervalLabel(s)}
              </option>
            ))}
          </select>
          <small>Each check makes 9 tiny connections. It uses almost no data.</small>
        </label>

        <label className="field" htmlFor={field('speed')}>
          <span>Run a speed test</span>
          <select id={field('speed')} value={form.speedTestEveryHours} onChange={(e) => set('speedTestEveryHours', Number(e.target.value))}>
            {SPEED_TEST_SCHEDULES.map((h) => (
              <option key={h} value={h}>
                {scheduleLabel(h)}
              </option>
            ))}
          </select>
          <small>{form.speedTestEveryHours === 0 ? 'You can still run one by hand.' : `About ${gb} GB a month. Skipped during an outage.`}</small>
        </label>

        <label className="field" htmlFor={field('size')}>
          <span>Speed test size (MB)</span>
          <input id={field('size')} type="number" min={5} max={200} value={form.speedTestMB} onChange={(e) => set('speedTestMB', Number(e.target.value))} />
          <small>Download size. Upload uses 40% of it. Bigger is more accurate on fast plans.</small>
        </label>

        <label className="field" htmlFor={field('lat')}>
          <span>Struggling when latency is over (ms)</span>
          <input id={field('lat')} type="number" min={10} max={5000} value={form.latencyWarnMs} onChange={(e) => set('latencyWarnMs', Number(e.target.value))} />
        </label>

        <label className="field" htmlFor={field('loss')}>
          <span>Struggling when packet loss reaches (%)</span>
          <input id={field('loss')} type="number" min={1} max={99} value={form.lossWarnPct} onChange={(e) => set('lossWarnPct', Number(e.target.value))} />
        </label>

        <label className="field" htmlFor={field('drop')}>
          <span>Slow when a speed test is below (% of usual)</span>
          <input id={field('drop')} type="number" min={5} max={95} value={form.speedDropPct} onChange={(e) => set('speedDropPct', Number(e.target.value))} />
          <small>"Usual" is the median of the last 7 days, once there are 3 tests.</small>
        </label>

        <label className="field" htmlFor={field('keep')}>
          <span>Keep history for (days)</span>
          <input id={field('keep')} type="number" min={1} max={365} value={form.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} />
        </label>
      </div>

      <fieldset className="checks">
        <legend>Notify me when</legend>
        <label>
          <input type="checkbox" checked={form.notifyOutage} onChange={(e) => set('notifyOutage', e.target.checked)} /> the internet goes down, and when it's back
        </label>
        <label>
          <input type="checkbox" checked={form.notifyDegraded} onChange={(e) => set('notifyDegraded', e.target.checked)} /> it's struggling for 3 checks in a row
        </label>
        <label>
          <input type="checkbox" checked={form.notifySlow} onChange={(e) => set('notifySlow', e.target.checked)} /> a speed test is much slower than usual
        </label>
        <small className="muted">
          Notifications appear under the bell at the top. To get them on your phone, add ntfy in Settings › Notifications.
        </small>
      </fieldset>

      {error && <div className="notice bad">{error}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn" disabled={!dirty || state === 'saving'} onClick={save}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' && !dirty && (
          <span role="status" style={{ fontSize: 14, color: 'var(--eucalypt-ink)' }}>
            Saved
          </span>
        )}
      </div>
    </section>
  )
}
