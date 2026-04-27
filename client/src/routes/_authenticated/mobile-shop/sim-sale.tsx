import { createFileRoute } from '@tanstack/react-router'
import SimSalePage from '@/features/mobile-shop/sim-sale'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/sim-sale')({
  component: () => (
    <MobileShopGuard>
      <SimSalePage />
    </MobileShopGuard>
  ),
})
