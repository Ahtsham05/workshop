import { createFileRoute } from '@tanstack/react-router'
import view from '@/features/purchase/view'

export const Route = createFileRoute('/_authenticated/purchase-view/')({
  component: view,
})


