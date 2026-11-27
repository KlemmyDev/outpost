import { FeaturesPanel } from './FeaturesPanel'
import { UpdatesPanel } from './UpdatesPanel'

export function SettingsPage() {
  return (
    <main className="page">
      <span className="eyebrow">Quartermaster</span>
      <h1>Settings</h1>
      <p className="lead">Choose what Outpost does, and keep it up to date.</p>
      <UpdatesPanel />
      <FeaturesPanel />
    </main>
  )
}
