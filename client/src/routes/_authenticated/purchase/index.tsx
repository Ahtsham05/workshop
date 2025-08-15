import { createFileRoute } from '@tanstack/react-router'
import Purchase from '@/features/purchase'

export const Route = createFileRoute('/_authenticated/purchase/')({
  component: Purchase,
})
