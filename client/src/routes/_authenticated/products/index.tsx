import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Products from '@/features/products'

const productsSearchSchema = z.object({
  // 'performance' shows sales rankings/analytics instead of the catalog table;
  // 'manufacturing' the type/BOM/procurement view (only for businesses with the module).
  // 'cleanup' = category-wise dead stock / unsold / priced-wrong / duplicates (features/products/cleanup).
  view: z.enum(['catalog', 'performance', 'manufacturing', 'cleanup']).optional().catch(undefined),
  // A product list's id — the catalog shows only that list (see features/products/lists).
  list: z.string().regex(/^[0-9a-f]{24}$/i).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/products/')({
  validateSearch: productsSearchSchema,
  component: Products,
})
