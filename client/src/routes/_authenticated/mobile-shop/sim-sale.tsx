import { createFileRoute } from '@tanstack/react-router'
import SimSalePage from '@/features/mobile-shop/sim-sale'

export const Route = createFileRoute('/_authenticated/mobile-shop/sim-sale')({
  component: SimSalePage,
})
