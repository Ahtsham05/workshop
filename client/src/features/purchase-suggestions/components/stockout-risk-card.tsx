import { PackageX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockoutPrediction } from '@/stores/purchaseSuggestions.api'
import { formatNumber, urgencyTheme } from '../utils/format'

export function StockoutRiskCard({ item }: { item: StockoutPrediction }) {
  const theme = urgencyTheme(item.daysRemaining)
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm ring-1', theme.ring)}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', theme.bg)}>
        <PackageX className={cn('h-4 w-4', theme.text)} />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-semibold leading-tight'>{item.name}</p>
        <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>{item.reason}</p>
        <p className='mt-1 text-[11px] text-muted-foreground'>
          {item.stock} in stock · {formatNumber(item.dailyDemand)}/day demand
        </p>
      </div>
      <div className='shrink-0 text-right'>
        <p className={cn('text-xl font-bold tabular-nums leading-none', theme.text)}>
          {item.daysRemaining === null ? '—' : item.daysRemaining}
        </p>
        <p className='text-[10px] text-muted-foreground'>days left</p>
      </div>
    </div>
  )
}
