import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import LeadsPage from '@/features/leads'

const leadsSearchSchema = z.object({
  // Set when arriving from a "Converted from Lead" link on the Customer ledger page.
  leadId: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/leads/')({
  component: LeadsPage,
  validateSearch: leadsSearchSchema,
})
