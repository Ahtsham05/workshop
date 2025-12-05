import { createFileRoute } from '@tanstack/react-router'
import AccountingPage from '@/features/accounting'
import { z } from 'zod'

const accountingSearchSchema = z.object({
  tab: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/accounting/')({
  component: AccountingPage,
  validateSearch: accountingSearchSchema,
})
