import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantDashboardPage from '@/features/restaurant/dashboard'

export const Route = createFileRoute('/_authenticated/restaurant/')({
  component: () => (
    <RestaurantGuard>
      <RestaurantDashboardPage />
    </RestaurantGuard>
  ),
})
