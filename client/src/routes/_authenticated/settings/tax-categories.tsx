import { createFileRoute } from '@tanstack/react-router'
import TaxCategoriesSettings from '@/features/settings/tax-categories'

export const Route = createFileRoute('/_authenticated/settings/tax-categories')({
  component: TaxCategoriesSettings,
})
