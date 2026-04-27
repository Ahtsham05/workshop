import { createFileRoute } from '@tanstack/react-router'
import CashBookPage from '@/features/mobile-shop/cash-book'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/cash-book')({
  component: () => (
    <MobileShopGuard>
      <CashBookPage />
    </MobileShopGuard>
  ),
})
