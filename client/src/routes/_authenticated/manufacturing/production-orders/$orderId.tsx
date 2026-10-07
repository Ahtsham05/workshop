import { createFileRoute } from '@tanstack/react-router'
import ProductionOrderDetail from '@/features/manufacturing/pages/production-order-detail'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/production-orders/$orderId'
)({
  component: ProductionOrderRoute,
})

function ProductionOrderRoute() {
  const { orderId } = Route.useParams()
  return <ProductionOrderDetail key={orderId} orderId={orderId} />
}
