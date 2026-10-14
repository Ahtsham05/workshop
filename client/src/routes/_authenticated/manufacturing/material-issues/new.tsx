import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import MaterialIssueEntryPage from '@/features/manufacturing/pages/material-issue-entry'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-issues/new'
)({
  validateSearch: z.object({ orderId: z.string().optional().catch(undefined) }),
  component: NewIssueRoute,
})

function NewIssueRoute() {
  const { orderId } = Route.useSearch()
  return <MaterialIssueEntryPage key={orderId || 'new'} orderId={orderId} />
}
