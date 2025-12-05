import { createFileRoute } from '@tanstack/react-router'
import CompanySetupPage from '@/features/company/company-setup'

export const Route = createFileRoute('/_authenticated/company/setup')({
  component: CompanySetupPage,
})
