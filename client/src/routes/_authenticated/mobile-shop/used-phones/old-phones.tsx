import { createFileRoute } from '@tanstack/react-router'
import OldPhonesPage from '@/features/mobile-shop/old-phones'

export const Route = createFileRoute('/_authenticated/mobile-shop/used-phones/old-phones')({
  component: OldPhonesPage,
})
