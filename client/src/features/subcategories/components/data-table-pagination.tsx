import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table } from '@tanstack/react-table'
import { useLanguage } from '@/context/language-context'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  paggination: {
    limit: number
    setLimit: (limit: number) => void
    currentPage: number
    setCurrentPage: (page: number) => void
    totalPage: number
  }
}

export function DataTablePagination<TData>({
  table,
  paggination,
}: DataTablePaginationProps<TData>) {
  const { limit, setLimit, currentPage, setCurrentPage, totalPage } = paggination
  const { t } = useLanguage()

  return (
    <div
      className="flex items-center justify-between overflow-clip px-2"
      style={{ overflowClipMargin: 1 }}
    >
      <div className="text-muted-foreground hidden flex-1 text-sm sm:block">
        {table.getFilteredSelectedRowModel().rows.length} {t('of')}{' '}
        {table.getFilteredRowModel().rows.length} {t('row_selected')}
      </div>
      <div className="flex items-center sm:space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="hidden text-sm font-medium sm:block">{t('rows_per_page')}</p>
          <Select
            value={`${limit}`}
            onValueChange={(value) => {
              setLimit(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={limit} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          {t('page')} {currentPage} {t('of')} {totalPage}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage <= 1}
          >
            <span className="sr-only">{t('go_to_first_page')}</span>
            <DoubleArrowLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <span className="sr-only">{t('go_to_previous_page')}</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPage}
          >
            <span className="sr-only">{t('go_to_next_page')}</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => setCurrentPage(totalPage)}
            disabled={currentPage >= totalPage}
          >
            <span className="sr-only">{t('go_to_last_page')}</span>
            <DoubleArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
