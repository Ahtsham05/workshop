import { createFileRoute } from '@tanstack/react-router'
import RepairPage from '@/features/mobile-shop/repair'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/repair')({
  component: () => (
    <MobileShopGuard>
      <RepairPage />
    </MobileShopGuard>
  ),
})
