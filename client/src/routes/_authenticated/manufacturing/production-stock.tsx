import { createFileRoute } from '@tanstack/react-router'
import ProductionStockPage from '@/features/manufacturing/pages/production-stock'

export const Route = createFileRoute('/_authenticated/manufacturing/production-stock')({
  component: ProductionStockPage,
})
