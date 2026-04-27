import { createFileRoute } from '@tanstack/react-router'
import InstallmentsPage from '@/features/mobile-shop/installments'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/installments')({
  component: () => (
    <MobileShopGuard>
      <InstallmentsPage />
    </MobileShopGuard>
  ),
})
