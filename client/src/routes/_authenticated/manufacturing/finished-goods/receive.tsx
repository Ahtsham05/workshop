import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import FinishedGoodsReceiptPage from '@/features/manufacturing/pages/finished-goods-receipt'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/finished-goods/receive'
)({
  // ?orderId= opens it on that production order.
  validateSearch: z.object({ orderId: z.string().optional().catch(undefined) }),
  component: ReceiveRoute,
})

function ReceiveRoute() {
  const { orderId } = Route.useSearch()
  return <FinishedGoodsReceiptPage key={orderId || 'new'} orderId={orderId} />
}
