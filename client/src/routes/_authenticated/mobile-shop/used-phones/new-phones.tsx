import { createFileRoute } from '@tanstack/react-router'
import NewPhonesPage from '@/features/mobile-shop/new-phones'

export const Route = createFileRoute('/_authenticated/mobile-shop/used-phones/new-phones')({
  component: NewPhonesPage,
})
