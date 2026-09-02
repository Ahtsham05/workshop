import { createFileRoute } from '@tanstack/react-router'
import ExchangeRatesSettings from '@/features/settings/exchange-rates'

export const Route = createFileRoute('/_authenticated/settings/exchange-rates')({
  component: ExchangeRatesSettings,
})
