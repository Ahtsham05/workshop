import { createFileRoute } from '@tanstack/react-router'
import MaterialReceiptsPage from '@/features/manufacturing/pages/material-receipts'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-receipts/'
)({
  component: MaterialReceiptsPage,
})
