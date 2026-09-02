import { createFileRoute } from '@tanstack/react-router'
import TaxExemptionsSettings from '@/features/settings/tax-exemptions'

export const Route = createFileRoute('/_authenticated/settings/tax-exemptions')({
  component: TaxExemptionsSettings,
})
