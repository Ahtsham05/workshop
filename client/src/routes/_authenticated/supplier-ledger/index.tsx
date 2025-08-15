import { createFileRoute } from '@tanstack/react-router'
import SupplierLedger from '@/features/supplier-ledger'

export const Route = createFileRoute('/_authenticated/supplier-ledger/')({
  component: SupplierLedger,
})
