import { createFileRoute } from '@tanstack/react-router'
import AccountingPage from '@/features/accounting'

export const Route = createFileRoute('/_authenticated/accounting/')({
  component: AccountingPage,
})
