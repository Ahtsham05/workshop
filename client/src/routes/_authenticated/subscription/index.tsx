import { createFileRoute } from '@tanstack/react-router'
import SubscriptionDashboard from '@/features/subscription'

export const Route = createFileRoute('/_authenticated/subscription/')({
  component: SubscriptionDashboard,
})
