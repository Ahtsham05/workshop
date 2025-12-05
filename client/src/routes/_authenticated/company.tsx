import { createFileRoute } from '@tanstack/react-router'
import CompanyProfilePage from '@/features/company/company-profile'

export const Route = createFileRoute('/_authenticated/company')({
  component: CompanyProfilePage,
})
