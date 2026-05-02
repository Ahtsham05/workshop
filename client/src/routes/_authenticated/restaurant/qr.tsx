import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantQrPage from '@/features/restaurant/qr-page'

export const Route = createFileRoute('/_authenticated/restaurant/qr')({
  component: () => (
    <RestaurantGuard>
      <RestaurantQrPage />
    </RestaurantGuard>
  ),
})
