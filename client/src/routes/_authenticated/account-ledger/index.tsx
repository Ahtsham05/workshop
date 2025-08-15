import { createFileRoute } from '@tanstack/react-router'
import AccountLedger from '@/features/account-ledger'

export const Route = createFileRoute('/_authenticated/account-ledger/')({
  component: AccountLedger,
})
