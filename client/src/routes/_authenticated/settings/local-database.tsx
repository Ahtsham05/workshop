import { createFileRoute } from '@tanstack/react-router'
import SettingsLocalDatabase from '@/features/settings/local-database'

export const Route = createFileRoute('/_authenticated/settings/local-database')({
  component: SettingsLocalDatabase,
})
