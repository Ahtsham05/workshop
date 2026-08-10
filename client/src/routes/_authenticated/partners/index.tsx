import { createFileRoute } from '@tanstack/react-router'
import PartnersPage from '@/features/partners'

export const Route = createFileRoute('/_authenticated/partners/')({
  component: PartnersPage,
})
