import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ManufacturingDashboard from '@/features/manufacturing/pages/dashboard'

export const Route = createFileRoute('/_authenticated/manufacturing/')({
  component: ManufacturingDashboard,
  validateSearch: z.object({
    range: z.enum(['7d', '30d', '90d', 'mtd']).optional(),
  }),
})
