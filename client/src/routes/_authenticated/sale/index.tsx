import { createFileRoute } from '@tanstack/react-router'
import Sale from '@/features/sale'

export const Route = createFileRoute('/_authenticated/sale/')({
  component: Sale,
})
