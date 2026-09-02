import { createFileRoute } from '@tanstack/react-router'
import LocalizationSettings from '@/features/settings/localization/localization-settings'

export const Route = createFileRoute('/_authenticated/settings/localization')({
  component: LocalizationSettings,
})
