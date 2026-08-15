import { Trophy } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SupplierRecommendation } from '@/stores/purchaseSuggestions.api'
import { formatMoney, formatNumber } from '../utils/format'

const SCORE_ROWS: { key: keyof SupplierRecommendation; label: string }[] = [
  { key: 'priceScore', label: 'Price' },
  { key: 'deliveryScore', label: 'Delivery' },
  { key: 'reliabilityScore', label: 'Reliability' },
]

const HISTORY_SCOPE_BADGE: Record<SupplierRecommendation['historyScope'], { label: string; tooltip: string; className: string } | null> = {
  product: null,
  organization: {
    label: 'Other products only',
    tooltip: "You haven't bought this exact product from them before — this is based on your overall order history with this supplier.",
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  none: {
    label: 'No purchase history',
    tooltip: "You haven't purchased from any supplier for this product yet. This is a starting suggestion — it will improve once you place an order.",
    className: 'bg-muted text-muted-foreground',
  },
}

export function SupplierScoreBlock({ supplier, reason }: { supplier: SupplierRecommendation; reason?: string }) {
  const scopeBadge = HISTORY_SCOPE_BADGE[supplier.historyScope]

  return (
    <div className='mt-3 rounded-lg border bg-muted/30 p-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-1.5 text-sm font-semibold'>
          <Trophy className='h-3.5 w-3.5 shrink-0 text-amber-500' />
          <span className='truncate'>{supplier.supplierName}</span>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          {scopeBadge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`cursor-help rounded-full px-2 py-0.5 text-[10px] font-medium ${scopeBadge.className}`}>{scopeBadge.label}</span>
              </TooltipTrigger>
              <TooltipContent className='max-w-64 text-xs'>{scopeBadge.tooltip}</TooltipContent>
            </Tooltip>
          )}
          <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary'>
            {formatNumber(supplier.overallScore)} / 100
          </span>
        </div>
      </div>

      <div className='mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground'>
        {supplier.avgPrice !== null && <span>Avg price: <span className='font-medium text-foreground'>{formatMoney(supplier.avgPrice)}</span></span>}
        {supplier.avgLeadTimeDays !== null && <span>Lead time: <span className='font-medium text-foreground'>{formatNumber(supplier.avgLeadTimeDays)}d</span></span>}
        {supplier.onTimeDeliveryRate !== null && <span>On-time: <span className='font-medium text-foreground'>{formatNumber(supplier.onTimeDeliveryRate)}%</span></span>}
      </div>

      <div className='mt-2.5 space-y-1.5'>
        {SCORE_ROWS.map((row) => (
          <div key={row.key} className='flex items-center gap-2'>
            <span className='w-20 shrink-0 text-[11px] text-muted-foreground'>{row.label}</span>
            <Progress value={Number(supplier[row.key]) || 0} className='h-1.5' />
            <span className='w-8 shrink-0 text-right text-[11px] font-medium tabular-nums'>{Math.round(Number(supplier[row.key]) || 0)}</span>
          </div>
        ))}
      </div>

      {reason && <p className='mt-2.5 text-xs leading-relaxed text-muted-foreground'>{reason}</p>}
    </div>
  )
}
