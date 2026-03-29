import { createFileRoute } from '@tanstack/react-router'
import PaymentFormPage from '@/features/subscription/payment-form'

export const Route = createFileRoute('/_authenticated/subscription/payment')({
  validateSearch: (search: Record<string, unknown>): { planType?: 'single' | 'multi' } => ({
    planType: search.planType as 'single' | 'multi' | undefined,
  }),
  component: PaymentFormPage,
})
