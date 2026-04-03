import { createFileRoute } from '@tanstack/react-router'
import PaymentFormPage from '@/features/subscription/payment-form'

export const Route = createFileRoute('/_authenticated/subscription/payment')({
  validateSearch: (search: Record<string, unknown>): { planType?: 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise' } => ({
    planType: search.planType as 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise' | undefined,
  }),
  component: PaymentFormPage,
})
