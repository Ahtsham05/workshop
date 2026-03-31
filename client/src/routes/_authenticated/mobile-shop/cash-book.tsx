import { createFileRoute } from '@tanstack/react-router'
import CashBookPage from '@/features/mobile-shop/cash-book'

export const Route = createFileRoute('/_authenticated/mobile-shop/cash-book')({
  component: CashBookPage,
})
