import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import PaymentCollectionsPage from '@/features/payment-collections'

const paymentCollectionsSearchSchema = z.object({
  tab: z.enum(['customer', 'supplier']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  direction: z.string().optional(),
  status: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/payment-collections')({
  component: PaymentCollectionsPage,
  validateSearch: paymentCollectionsSearchSchema,
})
