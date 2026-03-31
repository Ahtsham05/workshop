import { createFileRoute } from '@tanstack/react-router'
import LoadManagementPage from '@/features/mobile-shop/load'

export const Route = createFileRoute('/_authenticated/mobile-shop/load')({
  component: LoadManagementPage,
})
