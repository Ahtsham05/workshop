import { Badge } from '@/components/ui/badge'
import type { TransferStatus } from '@/stores/inventoryTransfer.api'
import { useLanguage } from '@/context/language-context'

const STYLES: Record<TransferStatus, string> = {
  suggested: 'bg-sky-50 text-sky-700 border-sky-200',
  approved: 'bg-violet-50 text-violet-700 border-violet-200',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
}

const LABELS: Record<TransferStatus, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const { t } = useLanguage()
  return (
    <Badge variant='outline' className={STYLES[status]}>
      {t(LABELS[status])}
    </Badge>
  )
}
