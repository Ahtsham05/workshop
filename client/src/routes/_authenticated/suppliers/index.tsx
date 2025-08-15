import { createFileRoute } from '@tanstack/react-router'
import Supplier from '@/features/suppliers'

export const Route = createFileRoute('/_authenticated/suppliers/')({
  component: Supplier,
})
