import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface Column<T> {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** Applied to header and cells. */
  className?: string
  align?: 'right' | 'center'
  /** Drop the column below this breakpoint (tables stay readable on tablets). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'max-sm:hidden',
  md: 'max-md:hidden',
  lg: 'max-lg:hidden',
  xl: 'max-xl:hidden',
}
const ALIGN = { right: 'text-right', center: 'text-center' } as const

/**
 * The module's list table. Desktop and tablet get a real table; phones get a stacked
 * card per row when `mobileCard` is given, so nothing important hides behind a
 * sideways scroll. Rows can be clicked, but the primary cell should still hold a
 * real link so keyboard and screen-reader users reach the same place.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  fetching,
  empty,
  onRowClick,
  rowClassName,
  mobileCard,
  footer,
  caption,
  skeletonRows = 6,
  className,
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  fetching?: boolean
  empty?: React.ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | false | undefined
  mobileCard?: (row: T) => React.ReactNode
  footer?: React.ReactNode
  caption?: string
  skeletonRows?: number
  className?: string
}) {
  const list = rows || []
  const showEmpty = !loading && list.length === 0
  const colClass = (c: Column<T>) =>
    cn(c.className, c.align && ALIGN[c.align], c.hideBelow && HIDE[c.hideBelow])

  return (
    <div
      className={cn('bg-card overflow-hidden rounded-xl border', className)}
      aria-busy={loading || fetching || undefined}
    >
      <div className={cn(mobileCard && 'max-md:hidden')}>
        <Table>
          {caption && <caption className='sr-only'>{caption}</caption>}
          <TableHeader className='bg-muted/50 sticky top-0 z-10 backdrop-blur'>
            <TableRow className='hover:bg-transparent'>
              {columns.map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(
                    'text-muted-foreground h-10 text-xs font-medium',
                    colClass(c)
                  )}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              fetching && !loading && 'opacity-60 transition-opacity'
            )}
          >
            {loading &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={i} className='hover:bg-transparent'>
                  {columns.map((c, ci) => (
                    <TableCell key={c.id} className={cn('py-3.5', colClass(c))}>
                      <Skeleton
                        className={cn(
                          'h-4',
                          ci === 0 ? 'w-24' : ci % 2 ? 'w-3/4' : 'w-1/2',
                          c.align === 'right' && 'ml-auto'
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {showEmpty && (
              <TableRow className='hover:bg-transparent'>
                <TableCell colSpan={columns.length} className='p-0'>
                  {empty}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              list.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row)
                  )}
                >
                  {columns.map((c) => (
                    <TableCell key={c.id} className={cn('py-3', colClass(c))}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {mobileCard && (
        <ul
          className={cn(
            'divide-y md:hidden',
            fetching && !loading && 'opacity-60'
          )}
        >
          {loading &&
            Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
              <li key={i} className='space-y-2 px-4 py-4'>
                <Skeleton className='h-4 w-1/3' />
                <Skeleton className='h-4 w-2/3' />
              </li>
            ))}
          {showEmpty && <li>{empty}</li>}
          {!loading &&
            list.map((row) => (
              <li key={rowKey(row)}>
                {onRowClick ? (
                  <button
                    type='button'
                    onClick={() => onRowClick(row)}
                    className='hover:bg-muted/40 focus-visible:ring-ring block min-h-14 w-full px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset'
                  >
                    {mobileCard(row)}
                  </button>
                ) : (
                  <div className='px-4 py-3'>{mobileCard(row)}</div>
                )}
              </li>
            ))}
        </ul>
      )}

      {footer && <div className='border-t px-4 py-2.5'>{footer}</div>}
    </div>
  )
}

/** Two-line cell: primary text over a muted secondary line. */
export function CellStack({
  primary,
  secondary,
  mono,
}: {
  primary: React.ReactNode
  secondary?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className='min-w-0'>
      <div
        className={cn(
          'truncate',
          mono ? 'font-mono text-xs font-medium' : 'font-medium'
        )}
      >
        {primary}
      </div>
      {secondary && (
        <div className='text-muted-foreground truncate text-xs'>
          {secondary}
        </div>
      )}
    </div>
  )
}
