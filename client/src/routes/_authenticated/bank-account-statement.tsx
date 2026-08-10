import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import BankAccountStatementPage from '@/features/bank-account-statement'

const bankAccountStatementSearchSchema = z.object({
  walletType: z.string().optional(),
})

function BankAccountStatementRoute() {
  const { walletType } = Route.useSearch()
  return <BankAccountStatementPage initialWalletType={walletType} />
}

export const Route = createFileRoute('/_authenticated/bank-account-statement')({
  validateSearch: bankAccountStatementSearchSchema,
  component: BankAccountStatementRoute,
})
