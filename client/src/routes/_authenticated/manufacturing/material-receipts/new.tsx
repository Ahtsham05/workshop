import { createFileRoute } from '@tanstack/react-router'
import MaterialReceiptEntryPage from '@/features/manufacturing/pages/material-receipt-entry'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-receipts/new'
)({
  component: () => <MaterialReceiptEntryPage />,
})
