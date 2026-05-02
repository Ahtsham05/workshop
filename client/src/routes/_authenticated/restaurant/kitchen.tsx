import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantKitchenPage from '@/features/restaurant/kitchen-page'

export const Route = createFileRoute('/_authenticated/restaurant/kitchen')({
  component: () => (
    <RestaurantGuard>
      <RestaurantKitchenPage />
    </RestaurantGuard>
  ),
})
