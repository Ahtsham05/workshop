import { createFileRoute } from '@tanstack/react-router'
import BillPaymentsPage from '@/features/mobile-shop/bill-payments'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/bill-payments')({
  component: () => (
    <MobileShopGuard>
      <BillPaymentsPage />
    </MobileShopGuard>
  ),
})
