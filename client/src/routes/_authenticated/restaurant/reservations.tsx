import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantReservationsPage from '@/features/restaurant/reservations-page'

export const Route = createFileRoute('/_authenticated/restaurant/reservations')({
  component: () => (
    <RestaurantGuard>
      <RestaurantReservationsPage />
    </RestaurantGuard>
  ),
})
