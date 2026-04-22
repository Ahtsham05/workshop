import { createFileRoute } from '@tanstack/react-router'
import WhatsAppMessaging from '@/features/school/whatsapp/whatsapp-messaging'

export const Route = createFileRoute('/_authenticated/school/whatsapp/')({
  component: WhatsAppMessaging,
})
