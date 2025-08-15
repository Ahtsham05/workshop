import { createFileRoute } from '@tanstack/react-router'
import Customer from '@/features/customers'

export const Route = createFileRoute('/_authenticated/customers/')({
  component: Customer,
})
