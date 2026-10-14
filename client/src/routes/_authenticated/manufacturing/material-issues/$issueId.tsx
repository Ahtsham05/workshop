import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import MaterialIssueEntryPage from '@/features/manufacturing/pages/material-issue-entry'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-issues/$issueId'
)({
  // ?edit=true opens the posted voucher for editing.
  validateSearch: z.object({
    edit: z.coerce.boolean().optional().catch(undefined),
  }),
  component: IssueRoute,
})

function IssueRoute() {
  const { issueId } = Route.useParams()
  const { edit } = Route.useSearch()
  return (
    <MaterialIssueEntryPage
      key={`${issueId}:${edit ? 'edit' : 'view'}`}
      issueId={issueId}
      edit={!!edit}
    />
  )
}
