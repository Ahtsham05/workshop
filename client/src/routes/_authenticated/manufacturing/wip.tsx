import { createFileRoute } from '@tanstack/react-router'
import WipPage from '@/features/manufacturing/pages/wip'

export const Route = createFileRoute('/_authenticated/manufacturing/wip')({
  component: WipPage,
})
