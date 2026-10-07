import { createFileRoute } from '@tanstack/react-router'
import SettingsPage from '@/features/manufacturing/pages/settings'

export const Route = createFileRoute('/_authenticated/manufacturing/settings')({
  component: SettingsPage,
})
