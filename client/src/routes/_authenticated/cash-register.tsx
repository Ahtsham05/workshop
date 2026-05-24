import { createFileRoute } from '@tanstack/react-router'
import CashRegisterPage from '@/features/mobile-shop/cash-register'

export const Route = createFileRoute('/_authenticated/cash-register')({
  component: () => <CashRegisterPage />,
})
