import { createFileRoute } from '@tanstack/react-router'
import RepairPage from '@/features/mobile-shop/repair'

export const Route = createFileRoute('/_authenticated/mobile-shop/repair')({
  component: RepairPage,
})
