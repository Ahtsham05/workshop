import { cn } from '@/lib/utils'
import { useEngine } from '../engine-context'
import type { CellProps } from './cell-props'

export function ComputedCell({ row, column }: CellProps) {
  const { store } = useEngine()
  return (
    <div
      className={cn(
        'flex h-8 items-center px-1 text-sm font-medium tabular-nums',
        column.align === 'left' ? 'justify-start' : 'justify-end'
      )}
    >
      {column.render
        ? column.render(row, store.ctx())
        : String(row[column.key] ?? '')}
    </div>
  )
}
