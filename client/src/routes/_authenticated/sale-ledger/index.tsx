import { createFileRoute } from '@tanstack/react-router'
import SaleLedger from '@/features/sale-ledger'

export const Route = createFileRoute('/_authenticated/sale-ledger/')({
  component: SaleLedger,
})
