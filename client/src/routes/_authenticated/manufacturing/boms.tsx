import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import BomsPage from '@/features/manufacturing/pages/boms'

export const Route = createFileRoute('/_authenticated/manufacturing/boms')({
  component: BomsPage,
  validateSearch: z.object({
    productId: z.string().optional(),
    bomId: z.string().optional(),
    new: z.boolean().optional(),
  }),
})
