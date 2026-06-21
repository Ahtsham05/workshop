import { Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeadStockItem } from '@/stores/purchaseSuggestions.api'
import { DEAD_STOCK_ACTION_THEME, formatMoney } from '../utils/format'

export function DeadStockCard({ item }: { item: DeadStockItem }) {
  const actionTheme = DEAD_STOCK_ACTION_THEME[item.recommendedAction]
  return (
    <div className='flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm'>
      <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted'>
        <Archive className='h-4 w-4 text-muted-foreground' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <p className='truncate text-sm font-semibold leading-tight'>{item.name}</p>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', actionTheme.bg, actionTheme.text)}>
            {actionTheme.label}
          </span>
        </div>
        <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>{item.reason}</p>
        <p className='mt-1 text-[11px] text-muted-foreground'>
          {item.stock} units · no sales in {item.daysSinceLastSale ?? '90+'} days
        </p>
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-base font-bold tabular-nums leading-none'>{formatMoney(item.stockValue)}</p>
        <p className='text-[10px] text-muted-foreground'>tied up</p>
      </div>
    </div>
  )
}
