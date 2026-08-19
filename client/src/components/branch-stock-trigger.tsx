import { useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Can } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { useLazyGetProductBranchAvailabilityQuery, type BranchStockRow } from '@/stores/purchaseCatalog.api'

/**
 * Compact pill that opens a dialog listing this exact product/variant's stock at every
 * other branch — read-only, informational (doesn't let the cashier sell from another
 * branch). Fetches on demand (only when opened), never on every catalog row render.
 * Absent entirely for roles without `viewBranches`.
 */
export function BranchStockTrigger({
  productId,
  variantId,
  itemName,
  className,
  iconOnly = false,
}: {
  productId?: string
  variantId?: string
  itemName?: string
  className?: string
  /** Icon-only, no "Branches" label — for tight spots (e.g. an invoice line's pill
   * row) where every extra character of chrome competes with batch/serial pills for
   * the same sliver of column width. Title attribute keeps it identifiable on hover. */
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fetchAvailability, { data = EMPTY_ROWS, isFetching, isError }] = useLazyGetProductBranchAvailabilityQuery()

  if (!productId) return null

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) fetchAvailability({ productId, variantId })
  }

  return (
    <Can permission='viewBranches'>
      <button
        type='button'
        title={iconOnly ? 'Branch stock' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          handleOpenChange(true)
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          iconOnly ? 'p-1' : 'px-1.5 py-0.5',
          className,
        )}
      >
        <Building2 className='h-2.5 w-2.5' />
        {iconOnly ? null : 'Branches'}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className='sm:max-w-md'
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <Building2 className='h-4 w-4 text-blue-600' />
              Branch Availability
            </DialogTitle>
            {itemName ? <DialogDescription className='truncate'>{itemName}</DialogDescription> : null}
          </DialogHeader>

          <div className='max-h-[360px] space-y-1.5 overflow-y-auto'>
            {isFetching && data.length === 0 ? (
              <div className='flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' /> Loading…
              </div>
            ) : isError ? (
              <div className='py-8 text-center text-sm text-muted-foreground'>
                Couldn't load branch stock. Try again.
              </div>
            ) : data.length === 0 ? (
              <div className='py-8 text-center text-sm text-muted-foreground'>No active branches found.</div>
            ) : (
              data.map((row) => <BranchStockRowView key={row.branchId} row={row} />)
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Can>
  )
}

const EMPTY_ROWS: BranchStockRow[] = []

function BranchStockRowView({ row }: { row: BranchStockRow }) {
  const stockColor = !row.found
    ? 'text-muted-foreground'
    : row.availableQuantity <= 0
      ? 'text-red-600'
      : row.availableQuantity <= 5
        ? 'text-red-500'
        : row.availableQuantity <= 20
          ? 'text-amber-500'
          : 'text-green-600'
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
        row.isCurrentBranch ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30' : 'border-border',
      )}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1.5'>
          <span className='truncate text-sm font-medium'>{row.branchName}</span>
          {row.isCurrentBranch ? (
            <span className='shrink-0 rounded-full bg-blue-600 px-1.5 py-0 text-[10px] font-medium text-white'>
              Current
            </span>
          ) : null}
        </div>
        {row.found && row.batches.length > 0 ? (
          <div className='mt-0.5 truncate text-[11px] text-muted-foreground'>
            {row.batches.map((b) => `${b.batchNumber}: ${b.quantity}`).join(', ')}
          </div>
        ) : null}
      </div>
      <div className='shrink-0 text-right'>
        {row.found ? (
          <>
            <div className={cn('text-sm font-semibold', stockColor)}>{row.availableQuantity} left</div>
            {row.reservedQuantity > 0 ? (
              <div className='text-[10px] text-muted-foreground'>{row.reservedQuantity} reserved</div>
            ) : null}
          </>
        ) : (
          <span className='text-xs text-muted-foreground'>Not carried</span>
        )}
      </div>
    </div>
  )
}
