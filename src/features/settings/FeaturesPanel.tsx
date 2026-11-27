import { useRouter, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '#/platform/ui/api'
import { Icon } from '#/platform/ui/Logo'
import type { FeatureState } from '#/platform/features/types'

function explain(f: FeatureState, all: FeatureState[]): string | null {
  if (f.core) return 'Part of the platform. Always on.'
  if (f.source === 'env') return `Set to ${f.wanted ? 'on' : 'off'} in the server's .env file (OUTPOST_FEATURES).`
  if (f.wanted && f.blockedBy.length > 0) {
    const names = f.blockedBy.map((id) => all.find((x) => x.id === id)?.name ?? id)
    return `Waiting for ${names.join(' and ')} to be switched on.`
  }
  return null
}

export function FeaturesPanel() {
  const { platform } = useRouteContext({ from: '__root__' })
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const features = platform.features

  async function toggle(f: FeatureState) {
    setBusy(f.id)
    setError(null)
    try {
      await api('PUT', `/api/features/${f.id}`, { enabled: !f.wanted })
      // Re-runs the root beforeLoad, so the menu and route guards update at once.
      await router.invalidate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="features" className="card" aria-labelledby="features-title">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="features-title">Features</h2>
        <span className="muted" style={{ fontSize: 14 }}>
          Switch off what you don't use. It leaves the menu and its pages stop working, for everyone at home.
        </span>
      </div>
      {error && <div className="notice bad">{error}</div>}
      <div className="rows">
        {features.map((f) => {
          const note = explain(f, features)
          return (
            <div key={f.id} className="row">
              <span style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0, flex: '1 1 320px' }}>
                <Icon path={f.icon} color={f.enabled ? 'var(--ochre)' : 'var(--muted-dot)'} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 15 }}>{f.name}</strong>
                    <span className="mono">{f.code}</span>
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {f.description}
                  </span>
                  {note && (
                    <span style={{ fontSize: 13, color: f.blockedBy.length ? 'var(--ochre-ink)' : 'var(--stone)' }}>{note}</span>
                  )}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={f.wanted}
                aria-label={`${f.name} ${f.wanted ? 'on' : 'off'}`}
                disabled={f.locked || busy !== null}
                onClick={() => toggle(f)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
