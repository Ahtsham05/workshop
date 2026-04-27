import { createFileRoute } from '@tanstack/react-router'
import ServicesPage from '@/features/mobile-shop/services'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/services')({
  component: () => (
    <MobileShopGuard>
      <ServicesPage />
    </MobileShopGuard>
  ),
})
