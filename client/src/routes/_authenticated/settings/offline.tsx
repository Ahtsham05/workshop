import { createFileRoute } from '@tanstack/react-router'
import SettingsOfflineMode from '@/features/settings/offline'

export const Route = createFileRoute('/_authenticated/settings/offline')({
  component: SettingsOfflineMode,
})
