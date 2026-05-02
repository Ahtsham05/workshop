import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantReportsPage from '@/features/restaurant/reports-page'

export const Route = createFileRoute('/_authenticated/restaurant/reports')({
  component: () => (
    <RestaurantGuard>
      <RestaurantReportsPage />
    </RestaurantGuard>
  ),
})
