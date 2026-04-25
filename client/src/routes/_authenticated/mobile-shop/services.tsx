import { createFileRoute } from '@tanstack/react-router'
import ServicesPage from '@/features/mobile-shop/services'

export const Route = createFileRoute('/_authenticated/mobile-shop/services')({
  component: ServicesPage,
})
