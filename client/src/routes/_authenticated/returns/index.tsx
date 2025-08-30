import { createFileRoute } from '@tanstack/react-router'
import Returns from '@/features/returns/pages'

export const Route = createFileRoute('/_authenticated/returns/')({
  component: Returns,
})
