import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import StockCounts from '@/features/stock-counts'

const searchSchema = z.object({
  tab: z.enum(['counts', 'plan', 'reports']).optional(),
})

export const Route = createFileRoute('/_authenticated/stock-counts/')({
  component: StockCounts,
  validateSearch: searchSchema,
})
