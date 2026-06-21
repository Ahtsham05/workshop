import { createFileRoute } from '@tanstack/react-router'
import PurchaseSuggestionsPage from '@/features/purchase-suggestions'

export const Route = createFileRoute('/_authenticated/purchase-suggestions')({
  component: PurchaseSuggestionsPage,
})
