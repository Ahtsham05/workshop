import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import PriceUpdates from '@/features/price-updates'

// `tab` lets other pages deep-link straight to the History list (e.g. after an update, or from a
// product's price-history view). `batch` opens one update's detail sheet.
const priceUpdatesSearchSchema = z.object({
  tab: z.enum(['update', 'history']).optional(),
  batch: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/price-updates')({
  component: PriceUpdates,
  validateSearch: priceUpdatesSearchSchema,
})
