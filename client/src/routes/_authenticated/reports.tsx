import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import ReportsPage from '@/features/reports'

const reportsSearchSchema = z.object({
  tab: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/reports')({
  component: ReportsPage,
  validateSearch: reportsSearchSchema,
})
