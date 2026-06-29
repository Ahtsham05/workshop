import { createFileRoute } from '@tanstack/react-router'
import StockTransfer from '@/features/stock-transfer'

export const Route = createFileRoute('/_authenticated/stock-transfer')({
  component: StockTransfer,
})
