import { createFileRoute } from '@tanstack/react-router'
import PurchaseLedgerDetail from '@/features/purchase-ledger-detail'

export const Route = createFileRoute('/(reports)/purchase-ledger-detail')({
  component: PurchaseLedgerDetail,
})

