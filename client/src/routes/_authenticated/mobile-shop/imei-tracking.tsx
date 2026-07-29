import { createFileRoute } from '@tanstack/react-router'
import ImeiTrackingPage from '@/features/mobile-shop/imei-tracking'

// Unlike its mobile-shop-only siblings in this folder, this route has no MobileShopGuard —
// serial number tracking applies to every business type (see route-permissions.ts's
// excludeBusinessTypes: ['school', 'restaurant'] rule for this path), IMEI-only for mobile_shop.
export const Route = createFileRoute('/_authenticated/mobile-shop/imei-tracking')({
  component: () => <ImeiTrackingPage />,
})
