import { Badge } from '@/components/ui/badge'
import type { TransferStatus } from '@/stores/inventoryTransfer.api'
import { useLanguage } from '@/context/language-context'

// 'partial' is a display-only status for a grouped bulk-transfer row whose line items span
// more than one real status (e.g. 2 of 3 products already received) — never stored as such.
type DisplayStatus = TransferStatus | 'partial'

const STYLES: Record<DisplayStatus, string> = {
  suggested: 'bg-sky-50 text-sky-700 border-sky-200',
  approved: 'bg-violet-50 text-violet-700 border-violet-200',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  partial: 'bg-blue-50 text-blue-700 border-blue-200',
}

const LABELS: Record<DisplayStatus, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  partial: 'Partially received',
}

export function TransferStatusBadge({ status }: { status: DisplayStatus }) {
  const { t } = useLanguage()
  return (
    <Badge variant='outline' className={STYLES[status]}>
      {t(LABELS[status])}
    </Badge>
  )
}
