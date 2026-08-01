import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass, type StatCardTone } from '@/lib/stat-card-tones'
import type { LucideIcon } from 'lucide-react'

/** One stat tile shared by every Reports KPI row (Product Details' Stock Movement /
 * Financial Summary, the Stock report's summary cards, etc.) — every quantity gets the
 * same shape, so a reconciliation reads as one system instead of a grab-bag of ad-hoc
 * colored boxes. */
export function MovementTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  tone: StatCardTone
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className={cn(kpiCardClass(tone), 'p-3')}>
      <div className='flex items-center justify-between gap-2 mb-2'>
        <p className='text-xs font-medium text-muted-foreground truncate'>{label}</p>
        <div className={cn('shrink-0', toneIconWrapClass(tone))}>
          <Icon className='h-4 w-4' />
        </div>
      </div>
      <p className='text-2xl font-bold tabular-nums'>{value}</p>
      {sub && <p className='text-xs text-muted-foreground mt-1 truncate'>{sub}</p>}
    </div>
  )
}
