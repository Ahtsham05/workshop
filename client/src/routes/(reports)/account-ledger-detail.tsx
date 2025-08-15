import { createFileRoute } from '@tanstack/react-router'
import AccountLedgerDetail from '@/features/account-ledger-detail'

export const Route = createFileRoute('/(reports)/account-ledger-detail')({
  component: AccountLedgerDetail,
})

