import { createFileRoute } from '@tanstack/react-router'
import SupplierLedgerDetail from '@/features/supplier-ledger-detail'

export const Route = createFileRoute('/(reports)/supplier-ledger-detail')({
  component: SupplierLedgerDetail,
})

