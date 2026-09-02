import { createFileRoute } from '@tanstack/react-router'
import CurrencySettings from '@/features/settings/currency/currency-settings'

export const Route = createFileRoute('/_authenticated/settings/currency')({
  component: CurrencySettings,
})
