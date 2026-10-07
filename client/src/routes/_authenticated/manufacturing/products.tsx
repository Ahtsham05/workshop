import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ManufacturingProducts from '@/features/manufacturing/pages/products'

export const Route = createFileRoute('/_authenticated/manufacturing/products')({
  component: ManufacturingProducts,
  validateSearch: z.object({ type: z.string().optional() }),
})
