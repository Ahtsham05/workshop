import { createFileRoute } from '@tanstack/react-router'
import ManufacturingDashboard from '@/features/manufacturing/pages/dashboard'

export const Route = createFileRoute('/_authenticated/manufacturing/')({
  component: ManufacturingDashboard,
})
