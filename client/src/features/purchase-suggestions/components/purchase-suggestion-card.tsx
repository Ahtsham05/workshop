import { ChevronDown, ShoppingCart, Sparkles, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { PurchaseSuggestion } from '@/stores/purchaseSuggestions.api'
import { SupplierScoreBlock } from './supplier-score-block'
import { TREND_THEME, formatNumber, urgencyTheme } from '../utils/format'

export function PurchaseSuggestionCard({
  suggestion,
  selected,
  onToggleSelect,
}: {
  suggestion: PurchaseSuggestion
  selected?: boolean
  onToggleSelect?: (productId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const trendTheme = TREND_THEME[suggestion.trend.label]
  const theme = urgencyTheme(suggestion.daysRemaining)
  const isUrgent = suggestion.daysRemaining !== null && suggestion.daysRemaining <= 7

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm ring-1 transition-shadow',
        theme.ring,
        selected && 'ring-2 ring-primary',
      )}
    >
      <div className={cn('flex items-start justify-between gap-3 p-4', theme.bg)}>
        <div className='flex items-start gap-3 min-w-0'>
          {onToggleSelect && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={() => onToggleSelect(suggestion.productId)}
              className='mt-1 shrink-0 bg-background'
            />
          )}
          <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background'>
            <ShoppingCart className={cn('h-4 w-4', theme.text)} />
          </span>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold leading-tight'>{suggestion.name}</p>
            <p className='mt-0.5 text-xs text-muted-foreground'>{suggestion.categoryName}</p>
          </div>
        </div>
        <div className='flex shrink-0 flex-col items-end'>
          <span className='text-2xl font-bold tabular-nums leading-none text-primary'>{suggestion.suggestedOrderQty}</span>
          <span className='text-[10px] text-muted-foreground'>units · {suggestion.horizonDays}d</span>
        </div>
      </div>

      <div className='flex-1 p-4'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {isUrgent && (
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', theme.bg, theme.text)}>
              <AlertCircle className='h-2.5 w-2.5' />
              {suggestion.daysRemaining === 0 ? 'Out of stock' : `${suggestion.daysRemaining}d left`}
            </span>
          )}
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', trendTheme.bg, trendTheme.text)}>
            {trendTheme.label} demand
          </span>
          {suggestion.seasonalFactor && (
            <span className='flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400'>
              <Sparkles className='h-2.5 w-2.5' />
              {suggestion.seasonalFactor.name} ×{suggestion.seasonalFactor.multiplier}
            </span>
          )}
          {suggestion.coveredByTransfer > 0 && (
            <span className='rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400'>
              {suggestion.coveredByTransfer} via transfer
            </span>
          )}
        </div>

        <p className='mt-2.5 text-xs leading-relaxed text-muted-foreground'>{suggestion.reason}</p>

        <div className='mt-3 grid grid-cols-3 gap-2 text-center text-xs'>
          <div className='rounded-md bg-muted/40 px-2 py-1.5'>
            <p className='font-semibold'>{suggestion.currentStock}</p>
            <p className='text-[10px] text-muted-foreground'>In stock</p>
          </div>
          <div className='rounded-md bg-muted/40 px-2 py-1.5'>
            <p className='font-semibold'>{formatNumber(suggestion.dailyDemand)}/d</p>
            <p className='text-[10px] text-muted-foreground'>Demand</p>
          </div>
          <div className='rounded-md bg-muted/40 px-2 py-1.5'>
            <p className='font-semibold'>{suggestion.reorderPoint}</p>
            <p className='text-[10px] text-muted-foreground'>Reorder pt</p>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button type='button' className='mt-2.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline'>
              {open ? 'Hide details' : 'View details'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className='mt-2 flex flex-wrap gap-2 text-xs'>
              <span className='rounded-md border bg-background px-2.5 py-1'>
                <span className='text-muted-foreground'>Safety stock: </span>
                <span className='font-semibold'>{suggestion.safetyStock}</span>
              </span>
              <span className='rounded-md border bg-background px-2.5 py-1'>
                <span className='text-muted-foreground'>Lead time: </span>
                <span className='font-semibold'>{suggestion.leadTimeDays}d</span>
              </span>
              <span className='rounded-md border bg-background px-2.5 py-1'>
                <span className='text-muted-foreground'>Incoming PO: </span>
                <span className='font-semibold'>{suggestion.incomingPOQty}</span>
              </span>
            </div>
            {suggestion.recommendedSupplier && <SupplierScoreBlock supplier={suggestion.recommendedSupplier} />}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
