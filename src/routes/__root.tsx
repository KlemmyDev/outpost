import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { getPlatformInfo } from '#/platform/platform.functions'
import { AppShell } from '#/platform/ui/AppShell'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Runs on every navigation, so the menu and the feature guards always match
  // what's switched on right now.
  beforeLoad: async () => ({ platform: await getPlatformInfo() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#f4f2ec' },
      { title: 'Outpost' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="page">
      <span className="eyebrow">Not here</span>
      <h1>This page isn't available</h1>
      <p className="lead">It doesn't exist, or the feature it belongs to is switched off.</p>
      <p style={{ display: 'flex', gap: 8, margin: 0 }}>
        <Link to="/" className="btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Overview
        </Link>
        <Link to="/settings" className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Features in Settings
        </Link>
      </p>
    </main>
  )
}
