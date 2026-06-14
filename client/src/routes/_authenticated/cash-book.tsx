import { createFileRoute } from '@tanstack/react-router'
import CashBookPage from '@/features/mobile-shop/cash-book'
import { CashBookGuard } from '@/components/cash-book-guard'

export const Route = createFileRoute('/_authenticated/cash-book')({
  component: () => (
    <CashBookGuard>
      <CashBookPage />
    </CashBookGuard>
  ),
})
