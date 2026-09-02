import { createFileRoute } from '@tanstack/react-router'
import TaxRatesSettings from '@/features/settings/tax-rates'

export const Route = createFileRoute('/_authenticated/settings/tax-rates')({
  component: TaxRatesSettings,
})
