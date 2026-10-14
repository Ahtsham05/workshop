import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import MaterialIssuesPage from '@/features/manufacturing/pages/material-issues'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-issues/'
)({
  // ?view=usage — Material usage (optionally one order: &orderId=…).
  validateSearch: z.object({
    view: z.enum(['usage']).optional().catch(undefined),
    orderId: z.string().optional().catch(undefined),
  }),
  component: MaterialIssuesRoute,
})

function MaterialIssuesRoute() {
  const { view, orderId } = Route.useSearch()
  return <MaterialIssuesPage view={view} orderId={orderId} />
}
