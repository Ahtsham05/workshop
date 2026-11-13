import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import EmployeeLedgerPage from '@/features/hr/employee-ledger'

const employeeLedgerSearchSchema = z.object({
  employeeId: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/hr/employee-ledger/')({
  component: EmployeeLedgerPage,
  validateSearch: employeeLedgerSearchSchema,
})
