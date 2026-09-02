import { createFileRoute } from '@tanstack/react-router'
import BusinessProfileSettings from '@/features/settings/business-profile/business-profile-settings'

export const Route = createFileRoute('/_authenticated/settings/business-profile')({
  component: BusinessProfileSettings,
})
