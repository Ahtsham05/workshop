import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Products from '@/features/products'

const productsSearchSchema = z.object({
  // 'performance' shows sales rankings/analytics instead of the catalog table;
  // 'manufacturing' the type/BOM/procurement view (only for businesses with the module).
  view: z.enum(['catalog', 'performance', 'manufacturing']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/products/')({
  validateSearch: productsSearchSchema,
  component: Products,
})
