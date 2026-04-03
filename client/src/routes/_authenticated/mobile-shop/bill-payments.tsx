import { createFileRoute } from '@tanstack/react-router'
import BillPaymentsPage from '@/features/mobile-shop/bill-payments'

export const Route = createFileRoute('/_authenticated/mobile-shop/bill-payments')({
  component: BillPaymentsPage,
})
