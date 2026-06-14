import { createFileRoute } from '@tanstack/react-router'
import SettingsSyncConflicts from '@/features/settings/sync-conflicts'

export const Route = createFileRoute('/_authenticated/settings/sync-conflicts')({
  component: SettingsSyncConflicts,
})
