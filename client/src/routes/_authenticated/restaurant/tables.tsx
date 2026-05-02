import { createFileRoute } from '@tanstack/react-router'
import { RestaurantGuard } from '@/components/restaurant-guard'
import RestaurantTablesPage from '@/features/restaurant/tables-page'

export const Route = createFileRoute('/_authenticated/restaurant/tables')({
  component: () => (
    <RestaurantGuard>
      <RestaurantTablesPage />
    </RestaurantGuard>
  ),
})
