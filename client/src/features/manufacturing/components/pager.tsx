import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { isAllRows } from '@/lib/page-size'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'

type PageData = { totalPages: number; totalResults: number; limit: number }

/**
 * Pagination footer for the module's list pages (hidden when everything fits on one page).
 * With `onLimitChange` it becomes the full footer the catalog's Products list has —
 * "Showing x–y of z", numbered pages and rows per page — and stays visible on one page so
 * the page size can still be changed.
 */
export function Pager({
  data,
  page,
  onPageChange,
  onLimitChange,
  pageSizeOptions = [10, 20, 50, 100, 200, 500],
  itemLabel,
}: {
  data?: PageData
  page: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  pageSizeOptions?: number[]
  /** Plural noun for the range text, e.g. "products". */
  itemLabel?: string
}) {
  if (onLimitChange) {
    if (!data || data.totalResults === 0) return null
    return (
      <FullPager
        data={data}
        page={page}
        onPageChange={onPageChange}
        onLimitChange={onLimitChange}
        pageSizeOptions={pageSizeOptions}
        itemLabel={itemLabel}
      />
    )
  }
  if (!data || data.totalPages <= 1) return null
  return (
    <SimplePagination
      currentPage={page}
      totalPages={data.totalPages}
      totalResults={data.totalResults}
      limit={data.limit}
      onPageChange={onPageChange}
    />
  )
}

/** Page numbers around the current page, `null` for an ellipsis; first and last always shown. */
function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = [1, total, current - 1, current, current + 1]
    .filter((p, i, all) => p >= 1 && p <= total && all.indexOf(p) === i)
    .sort((a, b) => a - b)
  const out: (number | null)[] = []
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

function FullPager({
  data,
  page,
  onPageChange,
  onLimitChange,
  pageSizeOptions,
  itemLabel,
}: {
  data: PageData
  page: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  pageSizeOptions: number[]
  itemLabel?: string
}) {
  const { t } = useLanguage()
  const { totalPages, totalResults, limit } = data
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, totalResults)
  const go = (p: number) => onPageChange(Math.min(Math.max(p, 1), totalPages))

  return (
    <nav
      aria-label={t('Pagination')}
      className='flex flex-wrap items-center justify-between gap-3'
    >
      <p className='text-muted-foreground text-sm tabular-nums'>
        {t('Showing')} <span className='text-foreground font-medium'>{from}</span>–
        <span className='text-foreground font-medium'>{to}</span> {t('of')}{' '}
        <span className='text-foreground font-medium'>
          {totalResults.toLocaleString()}
        </span>
        {itemLabel ? ` ${itemLabel}` : ''}
      </p>

      <div className='flex flex-wrap items-center gap-3 max-sm:w-full max-sm:justify-between'>
        <div className='flex items-center gap-1.5'>
          <span className='text-muted-foreground hidden text-sm sm:inline'>
            {t('Rows per page')}
          </span>
          <Select
            value={String(limit)}
            onValueChange={(v) => {
              onLimitChange(Number(v))
              onPageChange(1)
            }}
          >
            <SelectTrigger className='h-8 w-[84px]' aria-label={t('Rows per page')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent side='top'>
              {pageSizeOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {isAllRows(s) ? t('All') : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <div className='flex items-center gap-1'>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8 max-sm:hidden'
              onClick={() => go(1)}
              disabled={page === 1}
              aria-label={t('First page')}
            >
              <ChevronsLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() => go(page - 1)}
              disabled={page === 1}
              aria-label={t('Previous page')}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            {pageList(page, totalPages).map((p, i) =>
              p === null ? (
                <span
                  key={`gap-${i}`}
                  className='text-muted-foreground px-1 text-sm max-sm:hidden'
                >
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size='icon'
                  className={cn(
                    'h-8 w-auto min-w-8 px-2 tabular-nums',
                    p !== page && 'max-sm:hidden'
                  )}
                  onClick={() => go(p)}
                  aria-label={t('Page {{n}}').replace('{{n}}', String(p))}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </Button>
              )
            )}
            <span className='text-muted-foreground px-1 text-sm tabular-nums sm:hidden'>
              / {totalPages}
            </span>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8'
              onClick={() => go(page + 1)}
              disabled={page === totalPages}
              aria-label={t('Next page')}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-8 w-8 max-sm:hidden'
              onClick={() => go(totalPages)}
              disabled={page === totalPages}
              aria-label={t('Last page')}
            >
              <ChevronsRight className='h-4 w-4' />
            </Button>
          </div>
        )}
      </div>
    </nav>
  )
}
