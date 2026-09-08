import { createFileRoute } from '@tanstack/react-router'
import TaxJurisdictionsSettings from '@/features/settings/tax-jurisdictions'

export const Route = createFileRoute('/_authenticated/settings/tax-jurisdictions')({
  component: TaxJurisdictionsSettings,
})
