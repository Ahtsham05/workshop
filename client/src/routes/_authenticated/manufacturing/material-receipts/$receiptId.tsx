import { createFileRoute } from '@tanstack/react-router'
import MaterialReceiptEntryPage from '@/features/manufacturing/pages/material-receipt-entry'

export const Route = createFileRoute(
  '/_authenticated/manufacturing/material-receipts/$receiptId'
)({
  component: ReceiptRoute,
})

function ReceiptRoute() {
  const { receiptId } = Route.useParams()
  return <MaterialReceiptEntryPage key={receiptId} receiptId={receiptId} />
}
