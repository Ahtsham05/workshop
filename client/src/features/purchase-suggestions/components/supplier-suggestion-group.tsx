import { Trophy, Store } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { PurchaseSuggestion } from '@/stores/purchaseSuggestions.api'
import { PurchaseSuggestionCard } from './purchase-suggestion-card'
import { formatNumber } from '../utils/format'

export interface SupplierGroup {
  supplierId: string
  supplierName: string
  overallScore: number | null
  items: PurchaseSuggestion[]
}

export function SupplierSuggestionGroup({
  group,
  selected,
  onToggleSelect,
  onToggleGroup,
}: {
  group: SupplierGroup
  selected: Set<string>
  onToggleSelect: (productId: string) => void
  onToggleGroup: (productIds: string[], select: boolean) => void
}) {
  const productIds = group.items.map((i) => i.productId)
  const selectedCount = productIds.filter((id) => selected.has(id)).length
  const allSelected = selectedCount > 0 && selectedCount === productIds.length
  const totalUnits = group.items.reduce((s, i) => s + i.suggestedOrderQty, 0)

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2'>
        <label className='flex cursor-pointer items-center gap-2.5 text-sm font-semibold'>
          <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleGroup(productIds, !!v)} />
          {group.supplierId === 'unassigned' ? (
            <Store className='h-4 w-4 text-muted-foreground' />
          ) : (
            <Trophy className='h-4 w-4 text-amber-500' />
          )}
          {group.supplierName}
        </label>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          {group.overallScore !== null && (
            <span className='rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary'>
              {formatNumber(group.overallScore)}/100
            </span>
          )}
          <span>
            {group.items.length} product{group.items.length > 1 ? 's' : ''} · {totalUnits} units
          </span>
          {selectedCount > 0 && (
            <span className={cn('rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground')}>
              {selectedCount} selected
            </span>
          )}
        </div>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {group.items.map((s) => (
          <PurchaseSuggestionCard key={s.productId} suggestion={s} selected={selected.has(s.productId)} onToggleSelect={onToggleSelect} />
        ))}
      </div>
    </div>
  )
}
