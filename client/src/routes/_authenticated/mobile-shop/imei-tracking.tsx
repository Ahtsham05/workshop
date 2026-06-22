import { createFileRoute } from '@tanstack/react-router'
import ImeiTrackingPage from '@/features/mobile-shop/imei-tracking'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/imei-tracking')({
  component: () => (
    <MobileShopGuard>
      <ImeiTrackingPage />
    </MobileShopGuard>
  ),
})
