import { createFileRoute } from '@tanstack/react-router'
import SettingsTransactionLayout from '@/features/settings/transaction-layout'

export const Route = createFileRoute('/_authenticated/settings/transaction-layout')({
  component: SettingsTransactionLayout,
})
