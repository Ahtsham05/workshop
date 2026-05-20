import { createFileRoute } from '@tanstack/react-router'
import BusinessWhatsAppSettings from '@/features/settings/whatsapp/business-whatsapp-settings'

export const Route = createFileRoute('/_authenticated/settings/whatsapp')({
  component: BusinessWhatsAppSettings,
})
