import { createFileRoute } from '@tanstack/react-router'
import CustomerLedgerDetail from '@/features/customer-ledger-detail'

export const Route = createFileRoute('/(reports)/customer-ledger-detail')({
  component: CustomerLedgerDetail,
})

