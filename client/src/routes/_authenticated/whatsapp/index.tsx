import { createFileRoute } from '@tanstack/react-router'
import WhatsAppInboxPage from '@/features/whatsapp/inbox/inbox-page'

export const Route = createFileRoute('/_authenticated/whatsapp/')({
  component: WhatsAppInboxPage,
})
