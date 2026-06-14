import { createFileRoute } from '@tanstack/react-router'
import SettingsSyncDashboard from '@/features/settings/sync'

export const Route = createFileRoute('/_authenticated/settings/sync')({
  component: SettingsSyncDashboard,
})
