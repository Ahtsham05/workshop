import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import ManufacturingReportsPage from '@/features/manufacturing/pages/reports'

const REPORT_KEYS = [
  'production',
  'material-issues',
  'material-consumption',
  'finished-goods',
  'raw-materials',
  'stock-register',
  'in-process',
  'scrap',
  'daily',
  'batch',
] as const
const MENU_KEYS = REPORT_KEYS.filter((k) => k !== 'stock-register') as [
  Exclude<(typeof REPORT_KEYS)[number], 'stock-register'>,
  ...Exclude<(typeof REPORT_KEYS)[number], 'stock-register'>[],
]

export const Route = createFileRoute('/_authenticated/manufacturing/reports')({
  // ?report=finished-goods · ?report=stock-register&productId=…&from=finished-goods · ?report=batch&orderId=…
  validateSearch: z.object({
    report: z.enum(REPORT_KEYS).optional().catch(undefined),
    productId: z.string().optional().catch(undefined),
    orderId: z.string().optional().catch(undefined),
    from: z.enum(MENU_KEYS).optional().catch(undefined),
  }),
  component: ReportsRoute,
})

function ReportsRoute() {
  const { report, productId, orderId, from } = Route.useSearch()
  return <ManufacturingReportsPage report={report} productId={productId} orderId={orderId} from={from} />
}
