import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import WarrantyClaims from '@/features/warranty-claims'

const warrantyClaimsSearchSchema = z.object({
  // The claim open in the detail sheet.
  claim: z.string().regex(/^[0-9a-f]{24}$/i).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/warranty-claims/')({
  validateSearch: warrantyClaimsSearchSchema,
  component: WarrantyClaims,
})
