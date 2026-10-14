import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ProductionOrderDetail from '@/features/manufacturing/pages/production-order-detail'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/production-orders/$orderId'
)({
  // ?tab= keeps the open detail tab across reloads and in shared links.
  validateSearch: z.object({
    tab: z
      .enum([
        'overview',
        'materials',
        'operations',
        'assemblies',
        'wip',
        'quality',
        'scrap',
        'costs',
        'documents',
        'activity',
      ])
      .optional()
      .catch(undefined),
  }),
  component: ProductionOrderRoute,
})

function ProductionOrderRoute() {
  const { orderId } = Route.useParams()
  return <ProductionOrderDetail key={orderId} orderId={orderId} />
}
