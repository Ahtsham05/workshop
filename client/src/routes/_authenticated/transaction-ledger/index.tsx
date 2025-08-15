import { createFileRoute } from '@tanstack/react-router'
import TransactionLedger from '@/features/transaction-ledger'

export const Route = createFileRoute('/_authenticated/transaction-ledger/')({
  component: TransactionLedger,
})
