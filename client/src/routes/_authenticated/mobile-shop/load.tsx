import { createFileRoute } from '@tanstack/react-router'
import LoadManagementPage from '@/features/mobile-shop/load'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

export const Route = createFileRoute('/_authenticated/mobile-shop/load')({
  component: () => (
    <MobileShopGuard>
      <LoadManagementPage />
    </MobileShopGuard>
  ),
})
