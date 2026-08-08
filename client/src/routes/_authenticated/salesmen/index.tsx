import { createFileRoute } from '@tanstack/react-router'
import SalesmenPage from '@/features/salesmen'

export const Route = createFileRoute('/_authenticated/salesmen/')({
  component: SalesmenPage,
})
