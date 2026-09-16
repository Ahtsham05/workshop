import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Products from '@/features/products'

const productsSearchSchema = z.object({
  // 'performance' shows sales rankings/analytics instead of the catalog table.
  view: z.enum(['catalog', 'performance']).optional(),
})

export const Route = createFileRoute('/_authenticated/products/')({
  validateSearch: productsSearchSchema,
  component: Products,
})
