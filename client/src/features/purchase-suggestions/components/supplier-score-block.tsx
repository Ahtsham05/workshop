import { Trophy } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { SupplierRecommendation } from '@/stores/purchaseSuggestions.api'
import { formatMoney, formatNumber } from '../utils/format'

const SCORE_ROWS: { key: keyof SupplierRecommendation; label: string }[] = [
  { key: 'priceScore', label: 'Price' },
  { key: 'deliveryScore', label: 'Delivery' },
  { key: 'reliabilityScore', label: 'Reliability' },
]

export function SupplierScoreBlock({ supplier, reason }: { supplier: SupplierRecommendation; reason?: string }) {
  return (
    <div className='mt-3 rounded-lg border bg-muted/30 p-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-1.5 text-sm font-semibold'>
          <Trophy className='h-3.5 w-3.5 text-amber-500' />
          {supplier.supplierName}
        </div>
        <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary'>
          {formatNumber(supplier.overallScore)} / 100
        </span>
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
