import { useRouteContext } from '@tanstack/react-router'
import { Icon } from './Logo'

/**
 * Stands in for a feature's page until it's built, so each module can be
 * switched on, routed and shown in the menu from day one.
 */
export function FeaturePlaceholder({ id, children }: { id: string; children?: React.ReactNode }) {
  const { platform } = useRouteContext({ from: '__root__' })
  const feature = platform.features.find((f) => f.id === id)
  if (!feature) return null
  return (
    <main className="page">
      <span className="eyebrow">{feature.code}</span>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Icon path={feature.icon} size={40} color="var(--ochre)" />
        {feature.name}
      </h1>
      <p className="lead">{feature.description}</p>
      <div className="card">
        <h2>Coming soon</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
          This module is switched on and routed, but its screens haven't been built yet. You can switch it off in
          Settings, and it disappears from the menu and its address stops working.
        </p>
        {children}
      </div>
    </main>
  )
}
