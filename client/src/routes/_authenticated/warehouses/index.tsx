import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Warehouses from '@/features/warehouses'

const searchSchema = z.object({
  tab: z.enum(['overview', 'stock', 'replenishment', 'transfers', 'moves']).optional(),
})

export const Route = createFileRoute('/_authenticated/warehouses/')({
  component: Warehouses,
  validateSearch: searchSchema,
})
