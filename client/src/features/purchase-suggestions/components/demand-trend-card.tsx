import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DemandTrendItem } from '@/stores/purchaseSuggestions.api'
import { TREND_THEME, formatNumber } from '../utils/format'

export function DemandTrendCard({ item }: { item: DemandTrendItem }) {
  const theme = TREND_THEME[item.label]
  const Icon = item.label === 'rising' ? TrendingUp : TrendingDown
  return (
    <div className='flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm'>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', theme.bg)}>
        <Icon className={cn('h-4 w-4', theme.text)} />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-semibold leading-tight'>{item.name}</p>
        <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>{item.reason}</p>
        <p className='mt-1 text-[11px] text-muted-foreground'>
          {item.last7Qty} units (last 7d) vs {item.prev7Qty} (prior 7d)
        </p>
      </div>
      <div className='shrink-0 text-right'>
        <p className={cn('text-xl font-bold tabular-nums leading-none', theme.text)}>
          {item.growthPercent > 0 ? '+' : ''}{formatNumber(item.growthPercent)}%
        </p>
      </div>
    </div>
  )
}
