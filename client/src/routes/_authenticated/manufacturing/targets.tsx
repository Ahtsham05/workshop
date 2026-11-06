import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import TargetsPage from '@/features/manufacturing/pages/targets'

export const Route = createFileRoute('/_authenticated/manufacturing/targets')({
  // ?targetId=… opens that target · ?status=at_risk filters (target alerts link here)
  validateSearch: z.object({
    targetId: z.string().optional().catch(undefined),
    status: z.enum(['all', 'upcoming', 'achieved', 'on_track', 'at_risk', 'missed']).optional().catch(undefined),
  }),
  component: TargetsRoute,
})

function TargetsRoute() {
  const { targetId, status } = Route.useSearch()
  return <TargetsPage targetId={targetId} status={status} />
}
