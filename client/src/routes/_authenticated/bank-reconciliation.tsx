import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import BankReconciliationPage from '@/features/bank-reconciliation'

const bankReconciliationSearchSchema = z.object({
  walletType: z.string().optional(),
})

function BankReconciliationRoute() {
  const { walletType } = Route.useSearch()
  return <BankReconciliationPage initialWalletType={walletType} />
}

export const Route = createFileRoute('/_authenticated/bank-reconciliation')({
  validateSearch: bankReconciliationSearchSchema,
  component: BankReconciliationRoute,
})
