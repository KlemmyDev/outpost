import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/features/settings/Page'

export const Route = createFileRoute('/settings')({ component: SettingsPage })
