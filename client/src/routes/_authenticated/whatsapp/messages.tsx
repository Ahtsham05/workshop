import { createFileRoute } from '@tanstack/react-router'
import { MessageLogPage } from '@/features/whatsapp/messages/message-log-page'

export const Route = createFileRoute('/_authenticated/whatsapp/messages')({
  component: MessageLogPage,
})
