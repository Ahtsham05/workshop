import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ProductionOrdersBatchPage from '@/features/manufacturing/pages/production-orders-batch'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/production-orders/new'
)({
  validateSearch: z.object({
    productId: z.string().optional().catch(undefined),
  }),
  component: NewOrdersRoute,
})

function NewOrdersRoute() {
  const { productId } = Route.useSearch()
  return <ProductionOrdersBatchPage productId={productId} />
}
