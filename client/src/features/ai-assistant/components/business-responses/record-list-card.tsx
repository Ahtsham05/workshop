import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export interface BusinessListItem {
  primary: string
  secondary?: string
  value?: string
  valueSub?: string
}

export interface RecordListCardProps {
  icon?: ReactNode
  title: string
  items: BusinessListItem[]
  /** True underlying count when the tool truncated the list before sending it here. */
  totalCount?: number
  emptyMessage: string
  footerNote?: string
}

/** The "ranked rows" card — top products/customers, unpaid customers, low stock, search matches, etc. */
export function RecordListCard({ icon, title, items, totalCount, emptyMessage, footerNote }: RecordListCardProps) {
  const hiddenCount = totalCount && totalCount > items.length ? totalCount - items.length : 0

  return (
    <div className='w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md'>
      <p className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
        {icon}
        {title}
      </p>

      {items.length === 0 ? (
        <div className='mt-3 flex flex-col items-center gap-1.5 py-4 text-center'>
          <Inbox className='h-5 w-5 text-muted-foreground/50' />
          <p className='text-sm text-muted-foreground'>{emptyMessage}</p>
        </div>
      ) : (
        <ul className='mt-2 divide-y'>
          {items.map((item, i) => (
            <li key={`${item.primary}-${i}`} className='flex items-center gap-2.5 py-2 first:pt-2 last:pb-0'>
              <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground'>
                {i + 1}
              </span>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium leading-tight'>{item.primary}</p>
                {item.secondary && <p className='truncate text-xs text-muted-foreground'>{item.secondary}</p>}
              </div>
              {item.value && (
                <div className='shrink-0 text-right'>
                  <p className='text-sm font-medium tabular-nums leading-tight'>{item.value}</p>
                  {item.valueSub && <p className='text-xs text-muted-foreground tabular-nums'>{item.valueSub}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && <p className='mt-2 text-xs text-muted-foreground'>+{hiddenCount} more</p>}
      {footerNote && <p className='mt-3 border-t pt-2 text-xs text-muted-foreground'>{footerNote}</p>}
    </div>
  )
}
