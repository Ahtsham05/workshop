import { createFileRoute } from '@tanstack/react-router'
import PurchaseLedger from '@/features/purchase-ledger'

export const Route = createFileRoute('/_authenticated/purchase-ledger/')({
  component: PurchaseLedger,
})
