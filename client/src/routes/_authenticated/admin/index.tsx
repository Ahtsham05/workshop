import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import AdminPaymentsPage from '@/features/admin'

const adminSearchSchema = z.object({
  // Which console tab is open — alerts and push notifications deep-link to 'leads'.
  tab: z.enum(['manual', 'billing-config', 'payments', 'organizations', 'leads', 'users']).optional().catch(undefined),
  // An organization id whose sales-lead drawer should open.
  lead: z.string().regex(/^[0-9a-f]{24}$/i).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/admin/')({
  validateSearch: adminSearchSchema,
  component: AdminPaymentsPage,
})
