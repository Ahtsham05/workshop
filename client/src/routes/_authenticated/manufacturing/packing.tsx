import { createFileRoute } from '@tanstack/react-router'
import PackingPage from '@/features/manufacturing/pages/packing'

export const Route = createFileRoute('/_authenticated/manufacturing/packing')({
  component: PackingPage,
})
