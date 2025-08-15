import { createFileRoute } from '@tanstack/react-router'
import view from '@/features/sale/view'

export const Route = createFileRoute('/_authenticated/sale-view/')({
  component: view,
})


