import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, Check, ShoppingCart, PackagePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useMarkInsightReadMutation } from '@/stores/insight.api'
import {
  getTypeIcon,
  getRowStat,
  getRowToneClass,
  PRIORITY_THEME,
  type DisplayItem,
} from '../utils/insight-display'

const VISIBLE_ROWS_COLLAPSED = 4

export function GroupedInsightCard({ group }: { group: Extract<DisplayItem, { kind: 'group' }> }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [markRead, { isLoading: isMarking }] = useMarkInsightReadMutation()
  const navigate = useNavigate()
  const Icon = getTypeIcon(group.type)
  const theme = PRIORITY_THEME[group.priority]
  const isReorderable = group.type === 'reorder_suggestion'

  const handleMarkAllRead = () => {
    group.items.filter((i) => !i.isRead).forEach((i) => markRead({ id: i.id, isRead: true }))
  }

  const toggleOne = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  const allProductIds = useMemo(
    () => group.items.map((i) => i.meta.productId as string).filter(Boolean),
    [group.items],
  )
  const allSelected = selected.size > 0 && selected.size === allProductIds.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allProductIds))

  const getSelectedPrefillItems = () =>
    group.items
      .filter((i) => selected.has(i.meta.productId as string))
      .map((i) => ({ productId: i.meta.productId as string, quantity: Number(i.meta.suggestedReorderQty) || 1 }))

  const handleCreatePO = () => {
    navigate({ to: '/purchase-orders', search: { prefillItems: getSelectedPrefillItems() } })
  }

  const handleCreatePurchase = () => {
    navigate({ to: '/purchase-invoice', search: { prefillItems: getSelectedPrefillItems() } })
  }

  const hasMore = group.items.length > VISIBLE_ROWS_COLLAPSED
  const visibleItems = open ? group.items : group.items.slice(0, VISIBLE_ROWS_COLLAPSED)
  const remaining = group.items.length - VISIBLE_ROWS_COLLAPSED

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm ring-1 transition-opacity',
        theme.ring,
        group.isRead && 'opacity-60',
      )}
    >
      <div className={cn('flex items-start justify-between gap-3 p-4', theme.bg)}>
        <div className='flex items-start gap-3 min-w-0'>
          <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background'>
            <Icon className={cn('h-4 w-4', theme.text)} />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold leading-tight'>{group.title}</p>
            <p className={cn('mt-0.5 text-xs font-medium', theme.text)}>
              {group.priority} priority · {group.items.length} item{group.items.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {!group.isRead && (
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 shrink-0'
            disabled={isMarking}
            title='Mark all as read'
            onClick={handleMarkAllRead}
          >
            <Check className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>

      {isReorderable && (
        <label className='flex cursor-pointer items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'>
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} className='h-3.5 w-3.5' />
          {allSelected ? 'Deselect all' : 'Select all for reorder'}
        </label>
      )}

      <div className='flex-1 space-y-1.5 p-3'>
        {visibleItems.map((insight) => {
          const name = (insight.meta.name as string) || insight.title
          const productId = insight.meta.productId as string

          if (isReorderable) {
            const isSelected = selected.has(productId)
            return (
              <label
                key={insight.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors',
                  isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/40 hover:bg-muted/60',
                )}
              >
                <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(productId)} className='shrink-0' />
                <span className='min-w-0 flex-1 truncate font-medium'>{name}</span>
                <span className='shrink-0 rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground'>
                  Stock: <span className='font-semibold text-foreground'>{String(insight.meta.stock)}</span>
                </span>
                <Badge className='shrink-0 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' variant='secondary'>
                  +{String(insight.meta.suggestedReorderQty)} needed
                </Badge>
              </label>
            )
          }

          const stat = getRowStat(insight)
          return (
            <div
              key={insight.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-xs',
                insight.isRead ? 'bg-muted/20 opacity-60' : 'bg-muted/40',
              )}
            >
              <span className='min-w-0 flex-1 truncate font-medium'>{name}</span>
              <Badge className={cn('shrink-0 text-[10px] font-semibold', getRowToneClass(stat.tone))} variant='secondary'>
                {stat.label}
              </Badge>
            </div>
          )
        })}
      </div>

      {hasMore && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type='button'
              className='flex w-full items-center justify-center gap-1 border-t py-2 text-xs font-medium text-primary hover:bg-muted/40'
            >
              {open ? 'Show less' : `Show ${remaining} more`}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent />
        </Collapsible>
      )}

      {isReorderable && selected.size > 0 && (
        <div className='flex flex-col gap-2 border-t bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between'>
          <span className='text-xs font-medium'>{selected.size} product(s) selected</span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={handleCreatePurchase}
              className='gap-1.5'
              title='Record stock as already received — for stock you already have in hand'
            >
              <PackagePlus className='h-3.5 w-3.5' />
              Create Purchase
            </Button>
            <Button
              size='sm'
              onClick={handleCreatePO}
              className='gap-1.5'
              title='Send a formal order to the supplier first, receive stock later'
            >
              <ShoppingCart className='h-3.5 w-3.5' />
              Create Purchase Order
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
