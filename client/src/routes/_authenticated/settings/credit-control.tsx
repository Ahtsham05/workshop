import { createFileRoute } from '@tanstack/react-router'
import CreditControlSettings from '@/features/settings/credit-control/credit-control-settings'

export const Route = createFileRoute('/_authenticated/settings/credit-control')({
  component: CreditControlSettings,
})
