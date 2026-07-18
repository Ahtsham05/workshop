import { createFileRoute } from '@tanstack/react-router'
import { SmsLogPage } from '@/features/sms/sms-log-page'

export const Route = createFileRoute('/_authenticated/sms/log')({
  component: SmsLogPage,
})
