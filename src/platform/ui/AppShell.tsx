import { Link, useRouteContext, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

/** The header and menu. The menu lists only the features that are switched on. */
export function AppShell({ children }: { children: ReactNode }) {
  const { platform } = useRouteContext({ from: '__root__' })
  const nav = platform.features.filter((f) => f.enabled && f.inNav !== false && f.id !== 'settings')
  const settings = platform.features.find((f) => f.id === 'settings')

  return (
    <>
      <header className="shell-header">
        <Link to="/" className="wordmark">
          <Logo />
          outpost
        </Link>
        <nav aria-label="Main" className="nav">
          {nav.map((f) => (
            <Link key={f.id} to={f.path as LinkProps['to']} activeOptions={{ exact: f.path === '/' }}>
              {f.name}
            </Link>
          ))}
        </nav>
        <span className="shell-actions">
          {platform.update.available && (
            <Link to="/settings" hash="updates" className="pill">
              <span className="dot" style={{ background: 'var(--ochre)' }} aria-hidden="true" />
              Update available
            </Link>
          )}
          {settings && (
            <Link to="/settings" className="pill">
              {settings.name}
            </Link>
          )}
        </span>
      </header>
      {children}
    </>
  )
}
