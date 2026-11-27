import { FeaturesPanel } from './FeaturesPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { UpdatesPanel } from './UpdatesPanel'

export function SettingsPage() {
  return (
    <main className="page">
      <span className="eyebrow">Quartermaster</span>
      <h1>Settings</h1>
      <p className="lead">Choose what Outpost does, how it reaches you, and keep it up to date.</p>
      <UpdatesPanel />
      <NotificationsPanel />
      <FeaturesPanel />
    </main>
  )
}
