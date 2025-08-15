import { createFileRoute } from '@tanstack/react-router'
import SaleLedgerDetail from '@/features/sale-ledger-detail'

export const Route = createFileRoute('/(reports)/sale-ledger-detail')({
  component: SaleLedgerDetail,
})

