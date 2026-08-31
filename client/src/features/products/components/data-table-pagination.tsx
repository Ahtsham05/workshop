import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table } from '@tanstack/react-table';
import { useLanguage } from '@/context/language-context';

interface DataTablePaginationProps<TData> {
  table: Table<TData>; // The table instance (usually contains methods like setPageSize, setPageIndex, etc.)
  paggination: {
    limit: number; // Current page size
    setLimit: (limit: number) => void; // Function to update limit
    currentPage: number; // Current page number
    setCurrentPage: (page: number) => void; // Function to update the current page
    totalPage: number; // Total number of pages
    /** Total matching rows across all pages — omit to fall back to the page-count text. */
    totalResults?: number;
  };
}

/** Page numbers to render around the current page, with `null` standing in for an
 * ellipsis — always keeps the first and last page visible. */
function buildPageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const result: (number | null)[] = []
  let prev = 0
  for (const page of sorted) {
    if (prev && page - prev > 1) result.push(null)
    result.push(page)
    prev = page
  }
  return result
}

export function DataTablePagination<TData>({
  table,
  paggination,
}: DataTablePaginationProps<TData>) {
  const { limit, setLimit, currentPage, setCurrentPage, totalPage, totalResults } = paggination;
  const { t } = useLanguage();

  const rangeStart = totalResults ? (currentPage - 1) * limit + 1 : null
  const rangeEnd = totalResults ? Math.min(currentPage * limit, totalResults) : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 overflow-clip px-2" style={{ overflowClipMargin: 1 }}>
      <div className="text-muted-foreground text-sm">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <>
            {table.getFilteredSelectedRowModel().rows.length} {t('of')}{' '}
            {table.getFilteredRowModel().rows.length} {t('row_selected')}
          </>
        ) : rangeStart && rangeEnd ? (
          <>
            {t('Showing')} {rangeStart} {t('to')} {rangeEnd} {t('of')} {totalResults!.toLocaleString()} {t('products_list')}
          </>
        ) : (
          <>{t('page')} {currentPage} {t('of')} {totalPage}</>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <span className="sr-only">{t('previous') || 'Previous'}</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          {buildPageList(currentPage, totalPage).map((page, idx) =>
            page === null ? (
              <span key={`ellipsis-${idx}`} className="px-1.5 text-sm text-muted-foreground">…</span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPage}
          >
            <span className="sr-only">{t('next') || 'Next'}</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={`${limit}`}
          onValueChange={(value) => {
            setLimit(Number(value))
          }}
        >
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue placeholder={limit} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 30, 40, 50, 100, 500, 1000].map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize} / {t('page')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
