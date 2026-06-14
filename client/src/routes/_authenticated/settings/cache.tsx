import { createFileRoute } from '@tanstack/react-router'
import SettingsCacheManagement from '@/features/settings/cache'

export const Route = createFileRoute('/_authenticated/settings/cache')({
  component: SettingsCacheManagement,
})
