import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import StockAdjustments from '@/features/stock-adjustments'

const stockAdjustmentsSearchSchema = z.object({
  productId: z.string().optional(),
  productName: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/stock-adjustments')({
  component: StockAdjustments,
  validateSearch: stockAdjustmentsSearchSchema,
})
