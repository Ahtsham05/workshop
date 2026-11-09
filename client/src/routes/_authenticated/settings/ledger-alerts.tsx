import { createFileRoute } from '@tanstack/react-router'
import LedgerAlertsSettings from '@/features/settings/ledger-alerts/ledger-alerts-settings'

export const Route = createFileRoute('/_authenticated/settings/ledger-alerts')({
  component: LedgerAlertsSettings,
})
