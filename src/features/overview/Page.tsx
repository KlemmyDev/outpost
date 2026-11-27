import { Link, useRouteContext, type LinkProps } from '@tanstack/react-router'
import { Icon } from '#/platform/ui/Logo'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function OverviewPage() {
  const { platform } = useRouteContext({ from: '__root__' })
  const modules = platform.features.filter((f) => f.enabled && !f.core)
  const off = platform.features.filter((f) => !f.enabled && !f.core)
  const { version } = platform

  return (
    <main className="page">
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">Outpost HQ</span>
        <h1>
          {greeting(new Date().getHours())}.
          <br />
          All quiet at the outpost.
        </h1>
        <p className="lead">
          Version {version.version}
          {version.release ? ` (${version.release})` : ''} on the {platform.update.channel} channel.
          {platform.update.available && platform.update.latestVersion ? ` Version ${platform.update.latestVersion} is ready to install.` : ''}
        </p>
      </section>

      <section className="grid" aria-label="Features">
        {modules.map((f) => (
          <Link key={f.id} to={f.path as LinkProps['to']} className="card">
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Icon path={f.icon} color="var(--ochre)" />
              <span className="code">{f.code}</span>
            </span>
            <h2>{f.name}</h2>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              {f.description}
            </span>
          </Link>
        ))}
      </section>

      {off.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Switched off: {off.map((f) => f.name).join(', ')}.{' '}
          <Link to="/settings" hash="features">
            Change in Settings
          </Link>
        </p>
      )}
    </main>
  )
}
