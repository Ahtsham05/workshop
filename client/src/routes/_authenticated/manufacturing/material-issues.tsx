import { createFileRoute } from '@tanstack/react-router'
import MaterialIssuesPage from '@/features/manufacturing/pages/material-issues'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-issues'
)({
  component: MaterialIssuesPage,
})
