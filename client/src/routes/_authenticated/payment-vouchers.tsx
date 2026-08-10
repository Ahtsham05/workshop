import { createFileRoute } from '@tanstack/react-router'
import PaymentVouchersPage from '@/features/payment-vouchers'

export const Route = createFileRoute('/_authenticated/payment-vouchers')({
  component: () => <PaymentVouchersPage />,
})
