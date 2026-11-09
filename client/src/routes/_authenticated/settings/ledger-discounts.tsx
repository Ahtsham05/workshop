import { createFileRoute } from '@tanstack/react-router'
import LedgerDiscountsSettings from '@/features/settings/ledger-discounts/ledger-discounts-settings'

export const Route = createFileRoute('/_authenticated/settings/ledger-discounts')({
  component: LedgerDiscountsSettings,
})
