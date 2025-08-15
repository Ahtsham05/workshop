import { createFileRoute } from '@tanstack/react-router'
import TransactionLedgerDetail from '@/features/transaction-ledger-detail'

export const Route = createFileRoute('/(reports)/transaction-ledger-detail')({
  component: TransactionLedgerDetail,
})

