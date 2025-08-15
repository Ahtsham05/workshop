import { createFileRoute } from '@tanstack/react-router'
import MobileRepair from '@/features/mobile-repair'

export const Route = createFileRoute('/_authenticated/mobile-repair/')({
  component: MobileRepair,
})
