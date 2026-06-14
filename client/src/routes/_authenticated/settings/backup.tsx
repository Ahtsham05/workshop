import { createFileRoute } from '@tanstack/react-router'
import SettingsBackupRestore from '@/features/settings/backup'

export const Route = createFileRoute('/_authenticated/settings/backup')({
  component: SettingsBackupRestore,
})
