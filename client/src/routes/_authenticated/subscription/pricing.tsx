import { createFileRoute } from '@tanstack/react-router'
import PricingPage from '@/features/subscription/pricing'

export const Route = createFileRoute('/_authenticated/subscription/pricing')({
  component: PricingPage,
})
