import { createFileRoute } from '@tanstack/react-router'
import FinishedGoodsPage from '@/features/manufacturing/pages/finished-goods'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/finished-goods'
)({
  component: FinishedGoodsPage,
})
