import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import TraceabilityPage from '@/features/manufacturing/pages/traceability'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/traceability'
)({
  component: TraceabilityPage,
  validateSearch: z.object({
    kind: z.enum(['serial', 'batch', 'order']).optional(),
    id: z.string().optional(),
    label: z.string().optional(),
  }),
})
