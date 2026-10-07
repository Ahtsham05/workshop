import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ProductionOrdersPage from '@/features/manufacturing/pages/production-orders'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/production-orders/'
)({
  component: ProductionOrdersPage,
  validateSearch: z.object({
    status: z.string().optional(),
    new: z.boolean().optional(),
  }),
})
