import { createFileRoute } from '@tanstack/react-router'
import UsedPhonesPage from '@/features/mobile-shop/used-phones'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/used-phones')({
  component: () => (
    <MobileShopGuard>
      <UsedPhonesPage />
    </MobileShopGuard>
  ),
})
