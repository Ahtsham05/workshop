import { createFileRoute } from '@tanstack/react-router'
import CustomerLedger from '@/features/customer-ledger'

export const Route = createFileRoute('/_authenticated/customer-ledger/')({
  component: CustomerLedger,
})
