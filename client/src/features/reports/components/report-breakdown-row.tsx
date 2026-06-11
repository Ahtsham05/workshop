import { cn } from '@/lib/utils'

interface ReportBreakdownRowProps {
  label: string
  value: string
  valueClass?: string
  bold?: boolean
  border?: boolean
  sub?: string
}

/** Label and value on one line with a dotted leader — avoids wide empty gaps on large screens */
export function ReportBreakdownRow({
  label,
  value,
  valueClass = '',
  bold = false,
  border = false,
  sub,
}: ReportBreakdownRowProps) {
  return (
    <div className={cn(border && 'border-t pt-4 mt-1')}>
      <div className='flex items-baseline gap-3'>
        <span
          className={cn(
            'shrink-0',
            bold ? 'text-base font-semibold sm:text-lg' : 'text-base text-muted-foreground sm:text-base',
          )}
        >
          {label}
        </span>
        <span
          className='min-w-8 flex-1 border-b border-dotted border-muted-foreground/35'
          aria-hidden='true'
        />
        <span
          className={cn(
            'shrink-0 tabular-nums',
            bold ? 'text-lg font-bold sm:text-xl' : 'text-base font-semibold sm:text-lg',
            valueClass,
          )}
        >
          {value}
        </span>
      </div>
      {sub && <p className='mt-1 text-right text-sm text-muted-foreground'>{sub}</p>}
    </div>
  )
}
