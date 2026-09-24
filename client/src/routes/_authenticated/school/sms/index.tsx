import { createFileRoute } from '@tanstack/react-router'
import SmsMessaging from '@/features/school/sms/sms-messaging'

export const Route = createFileRoute('/_authenticated/school/sms/')({
  component: SmsMessaging,
})
