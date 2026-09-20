import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import PriceChecker from '@/features/price-checker'

// `q` lets other pages (Products list/detail) link straight into a pre-run search —
// see data-table-row-actions.tsx and product-header.tsx's "Check Price" actions.
const priceCheckerSearchSchema = z.object({
  q: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/price-checker')({
  component: PriceChecker,
  validateSearch: priceCheckerSearchSchema,
})
