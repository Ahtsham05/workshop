import { createFileRoute } from '@tanstack/react-router'
import AdminPaymentsPage from '@/features/admin'

export const Route = createFileRoute('/_authenticated/admin/')({
  component: AdminPaymentsPage,
})
