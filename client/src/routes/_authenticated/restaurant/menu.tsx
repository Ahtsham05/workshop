import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantMenuHubPage from '@/features/restaurant/menu-hub'

export const Route = createFileRoute('/_authenticated/restaurant/menu')({
  component: () => (
    <RestaurantGuard>
      <RestaurantMenuHubPage />
    </RestaurantGuard>
  ),
})
