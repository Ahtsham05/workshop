import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantPosPage from '@/features/restaurant/pos-page'

export const Route = createFileRoute('/_authenticated/restaurant/pos')({
  component: () => (
    <RestaurantGuard>
      <RestaurantPosPage />
    </RestaurantGuard>
  ),
})
