import { createFileRoute } from '@tanstack/react-router'
import MovementsPage from '@/features/manufacturing/pages/movements'

export const Route = createFileRoute('/_authenticated/manufacturing/movements')(
  {
    component: MovementsPage,
  }
)
