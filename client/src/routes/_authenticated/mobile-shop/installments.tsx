import { createFileRoute } from '@tanstack/react-router'
import InstallmentsPage from '@/features/mobile-shop/installments'

export const Route = createFileRoute('/_authenticated/mobile-shop/installments')({
  component: InstallmentsPage,
})
