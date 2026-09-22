import type { LucideIcon } from 'lucide-react'
import { fitValueSize } from '@/lib/fit-value-size'

/**
 * One of the four totals under the Products filters ("Total Stock Quantity: 1,436", ...).
 * From 640px up it is the same inline pill as before; on phones it becomes a small tile — icon and
 * label on the first row, the value under them — so four of them sit two per row instead of each
 * taking a full line. The value is sized to the tile (see fitValueSize), so a long amount is never cut.
 */
export function ProductSummaryChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm max-sm:@container max-sm:grid max-sm:grid-cols-[1rem_minmax(0,1fr)] max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:px-2.5'>
      <Icon className='h-4 w-4 text-muted-foreground max-sm:col-start-1 max-sm:row-start-1 max-sm:mt-0.5' />
      <span className='text-muted-foreground max-sm:col-start-2 max-sm:row-start-1 max-sm:text-xs max-sm:leading-snug'>{label}:</span>
      <span
        className='font-semibold tabular-nums max-sm:col-span-2 max-sm:row-start-2 max-sm:whitespace-nowrap max-sm:leading-tight max-sm:[font-size:var(--chip-fit)]'
        style={{ '--chip-fit': fitValueSize(value, 1) } as React.CSSProperties}
      >
        {value}
      </span>
    </div>
  )
}
