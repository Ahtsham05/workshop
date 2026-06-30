import { createFileRoute } from '@tanstack/react-router'
import SmsGatewaySettings from '@/features/settings/sms-gateway/sms-gateway-settings'

export const Route = createFileRoute('/_authenticated/settings/sms-gateway')({
  component: SmsGatewaySettings,
})
