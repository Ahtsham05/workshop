import { createFileRoute } from '@tanstack/react-router'
import MobileLoad from '@/features/mobile-load/add'

export const Route = createFileRoute('/_authenticated/mobile-load/')({
  component: MobileLoad,
})
