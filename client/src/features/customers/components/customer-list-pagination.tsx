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
import { useLanguage } from '@/context/language-context'

type Props = {
  currentPage: number
  totalPage: number
  limit: number
  setCurrentPage: (page: number) => void
  setLimit: (limit: number) => void
}

export function CustomerListPagination({
  currentPage,
  totalPage,
  limit,
  setCurrentPage,
  setLimit,
}: Props) {
  const { t } = useLanguage()

  return (
    <div className='flex items-center justify-end overflow-clip px-2' style={{ overflowClipMargin: 1 }}>
      {/* Phones: the three groups need ~345px, more than a 320-375px screen has, and (right-aligned) the
          overflow was clipped off the left edge. Below 640px they wrap onto two lines instead. */}
      <div className='flex items-center sm:space-x-6 lg:space-x-8 max-sm:flex-wrap max-sm:justify-end max-sm:gap-x-4 max-sm:gap-y-2'>
        <div className='flex items-center space-x-2'>
          <p className='text-sm font-medium'>{t('rows_per_page')}</p>
          <Select
            value={`${limit}`}
            onValueChange={(value) => setLimit(Number(value))}
          >
            <SelectTrigger className='h-8 w-[70px]'>
              <SelectValue placeholder={limit} />
            </SelectTrigger>
            <SelectContent side='top'>
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex w-[100px] items-center justify-center text-sm font-medium'>
          {t('page')} {currentPage} {t('of')} {totalPage}
        </div>
        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            className='hidden h-8 w-8 p-0 lg:flex'
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            <span className='sr-only'>Go to first page</span>
            <DoubleArrowLeftIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='h-8 w-8 p-0'
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <span className='sr-only'>Go to previous page</span>
            <ChevronLeftIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='h-8 w-8 p-0'
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPage}
          >
            <span className='sr-only'>Go to next page</span>
            <ChevronRightIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='hidden h-8 w-8 p-0 lg:flex'
            onClick={() => setCurrentPage(totalPage)}
            disabled={currentPage === totalPage}
          >
            <span className='sr-only'>Go to last page</span>
            <DoubleArrowRightIcon className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}
