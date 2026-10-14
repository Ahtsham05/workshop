import { createFileRoute } from '@tanstack/react-router'
import RequirementsPage from '@/features/manufacturing/pages/requirements'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/requirements'
)({
  component: RequirementsPage,
})
