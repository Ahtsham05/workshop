import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './button'
import { DEFAULT_PAGE_SIZE_OPTIONS, formatPageSize, isAllRows } from '@/lib/page-size'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

interface SimplePaginationProps {
  currentPage: number
  totalPages: number
  totalResults?: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function SimplePagination({
  currentPage,
  totalPages,
  totalResults,
  limit,
  onPageChange,
  onLimitChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className = '',
}: SimplePaginationProps) {
  if (totalPages <= 1 && !onLimitChange) return null

  const pageLimit = isAllRows(limit) && totalResults != null ? Math.max(totalResults, 1) : limit
  const startItem = totalResults != null ? Math.min((currentPage - 1) * pageLimit + 1, totalResults) : undefined
  const endItem = totalResults != null ? Math.min(currentPage * pageLimit, totalResults) : undefined

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t ${className}`}>
      {/* Results info */}
      <p className='text-sm text-muted-foreground'>
        {totalResults != null
          ? totalResults === 0
            ? 'No results'
            : `Showing ${startItem}–${endItem} of ${totalResults}`
          : `Page ${currentPage} of ${totalPages}`}
      </p>

      <div className='flex items-center gap-3'>
        {/* Rows per page */}
        {onLimitChange && (
          <div className='flex items-center gap-1.5'>
            <span className='text-sm text-muted-foreground hidden sm:inline'>Rows per page</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => { onLimitChange(Number(v)); onPageChange(1) }}
            >
              <SelectTrigger className='h-8 w-[75px]'>
                <SelectValue>{formatPageSize(limit)}</SelectValue>
              </SelectTrigger>
              <SelectContent side='top'>
                {pageSizeOptions.map((s) => (
                  <SelectItem key={s} value={String(s)}>{formatPageSize(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page buttons */}
        {totalPages > 1 && (
          <div className='flex items-center gap-1'>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8 hidden sm:flex'
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              title='First page'
            >
              <ChevronsLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>

            <span className='min-w-[70px] text-center text-sm font-medium'>
              {currentPage} / {totalPages}
            </span>

            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8 hidden sm:flex'
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              title='Last page'
            >
              <ChevronsRight className='h-4 w-4' />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
