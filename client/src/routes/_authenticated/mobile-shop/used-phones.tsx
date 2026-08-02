import { createFileRoute, Outlet } from '@tanstack/react-router'
import { MobileShopGuard } from '@/components/mobile-shop-guard'

/** Layout route for all /_authenticated/mobile-shop/used-phones/* paths — the guard
 * applies once here so the hub and both sub-pages (old-phones, new-phones) share it. */
export const Route = createFileRoute('/_authenticated/mobile-shop/used-phones')({
  component: () => (
    <MobileShopGuard>
      <Outlet />
    </MobileShopGuard>
  ),
})
