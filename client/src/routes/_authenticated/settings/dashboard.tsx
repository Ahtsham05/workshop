import { createFileRoute } from '@tanstack/react-router'
import SettingsDashboard from '@/features/settings/dashboard'

export const Route = createFileRoute('/_authenticated/settings/dashboard')({
  component: SettingsDashboard,
})
