import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useFormatMoney } from '@/lib/format-money'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import {
  useGetProductRankingsQuery,
  useLazyGetProductRankingsQuery,
  type AnalyticsRangeArgs,
  type ProductMetricsRow,
  type RankingSortField,
} from '@/stores/productAnalytics.api'
import { formatDays, formatPct, formatQty } from '../lib/analytics-format'
import { AbcBadge, GrowthIndicator, MovementBadge } from './analytics-badges'
import { MOVEMENT_META } from '../lib/analytics-classes'
import { ProductThumb } from './product-thumb'
import { CategoryFilter } from './category-filter'

export interface RankingFilters {
  abcClass: string
  movement: string
  categoryId: string
}

interface Props {
  range: AnalyticsRangeArgs
  filters: RankingFilters
  onFiltersChange: (next: RankingFilters) => void
}

const SORT_OPTIONS: { value: RankingSortField; label: string }[] = [
  { value: 'netRevenue', label: 'Net sales' },
  { value: 'netProfit', label: 'Gross profit' },
  { value: 'netUnits', label: 'Units sold' },
  { value: 'margin', label: 'Margin %' },
  { value: 'revenueGrowth', label: 'Sales growth %' },
  { value: 'revenueDelta', label: 'Sales change (amount)' },
  { value: 'velocity', label: 'Units per day' },
  { value: 'daysOfCover', label: 'Days of stock left' },
  { value: 'sellThrough', label: 'Sell-through %' },
  { value: 'stockValue', label: 'Stock value' },
  { value: 'currentStock', label: 'Stock on hand' },
  { value: 'returnRate', label: 'Return rate %' },
  { value: 'daysSinceLastSale', label: 'Days since last sale' },
  { value: 'invoiceCount', label: 'Invoices' },
  { value: 'name', label: 'Name' },
]

const ALL = 'all'
const RANK_KEY: Partial<Record<RankingSortField, keyof ProductMetricsRow['ranks']>> = {
  netRevenue: 'revenue',
  netProfit: 'profit',
  netUnits: 'units',
}

export function RankingsTable({ range, filters, onFiltersChange }: Props) {
  const { t } = useLanguage()
  const { showUrdu } = useUrduDisplay()
  const formatMoney = useFormatMoney()

  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 350)
  const [sortBy, setSortBy] = useState<RankingSortField>('netRevenue')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  useEffect(() => setPage(1), [search, sortBy, sortOrder, filters, range.startDate, range.endDate, limit])

  const args = {
    ...range,
    sortBy,
    sortOrder,
    page,
    limit,
    search: search.trim(),
    abcClass: filters.abcClass,
    movement: filters.movement,
    categoryId: filters.categoryId,
  }
  const { currentData, data, isLoading, isFetching, isError, refetch } = useGetProductRankingsQuery(args)
  const shown = currentData ?? data
  const [fetchExport, { isFetching: exporting }] = useLazyGetProductRankingsQuery()

  const activeFilterCount = [filters.abcClass, filters.movement, filters.categoryId, search.trim()].filter(Boolean).length

  const toggleSort = (field: RankingSortField) => {
    if (sortBy === field) setSortOrder((order) => (order === 'desc' ? 'asc' : 'desc'))
    else {
      setSortBy(field)
      setSortOrder(field === 'name' || field === 'daysOfCover' ? 'asc' : 'desc')
    }
  }

  const rankFor = (row: ProductMetricsRow, index: number) => {
    const key = RANK_KEY[sortBy]
    if (key && sortOrder === 'desc' && !search.trim() && !filters.abcClass && !filters.movement && !filters.categoryId) {
      return row.ranks[key]
    }
    return (page - 1) * limit + index + 1
  }

  const exportRows = async () => {
    try {
      const result = await fetchExport({ ...args, page: 1, limit: 200, export: true }).unwrap()
      const XLSX = await import('xlsx')
      const sheet = XLSX.utils.json_to_sheet(
        result.results.map((row, index) => ({
          '#': index + 1,
          Product: row.name,
          Barcode: row.barcode,
          SKU: row.sku,
          Category: row.categories.map((c) => c.name).join(', '),
          Brand: row.brandName || '',
          Class: row.abcClass || '',
          Movement: t(MOVEMENT_META[row.movement]?.label || row.movement),
          'Units sold': row.unitsSold,
          'Units returned': row.unitsReturned,
          'Net units': row.netUnits,
          'Net sales': row.netRevenue,
          'Gross profit': row.netProfit,
          'Margin %': row.margin ?? '',
          'Share of sales %': row.revenueShare,
          'Previous period sales': row.previous.netRevenue,
          'Sales growth %': row.revenueGrowth ?? '',
          'Units per day': row.velocity,
          'Stock on hand': row.currentStock,
          'Stock value': row.stockValue,
          'Days of stock left': row.daysOfCover ?? '',
          'Sell-through %': row.sellThrough ?? '',
          'Return rate %': row.returnRate ?? '',
          'Units purchased': row.unitsPurchased,
          'Avg purchase cost': row.avgPurchaseCost ?? '',
          'Avg selling price': row.avgSellingPrice ?? '',
          'Last sold': row.lastSoldAt ? row.lastSoldAt.slice(0, 10) : '',
        })),
      )
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, sheet, 'Product rankings')
      XLSX.writeFile(book, `product-rankings-${range.startDate}-to-${range.endDate}.xlsx`)
    } catch {
      toast.error(t('Export failed. Please try again.'))
    }
  }

  const SortHeader = ({ field, label, align = 'right' }: { field: RankingSortField; label: string; align?: 'left' | 'right' }) => {
    const active = sortBy === field
    const Icon = !active ? ArrowUpDown : sortOrder === 'desc' ? ArrowDown : ArrowUp
    return (
      <button
        type='button'
        onClick={() => toggleSort(field)}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        aria-sort={active ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
    )
  }

  const rows = shown?.results || []

  return (
    <Card className='gap-0'>
      <CardHeader className='space-y-3 pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div>
            <CardTitle className='text-base'>{t('Product rankings')}</CardTitle>
            <CardDescription className='text-xs'>
              {t('Every product ranked on real sales in the selected period — net of discounts and returns.')}
            </CardDescription>
          </div>
          <Button variant='outline' size='sm' className='h-8 gap-1.5' onClick={exportRows} disabled={exporting || !shown?.totalResults}>
            {exporting ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Download className='h-3.5 w-3.5' />}
            {t('Export')}
          </Button>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='relative w-full sm:w-64'>
            <Search className='pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('Search name, barcode, SKU, brand')}
              className='h-9 pl-8'
              aria-label={t('Search products')}
            />
          </div>
          <Select value={sortBy} onValueChange={(value) => { setSortBy(value as RankingSortField); setSortOrder(value === 'name' || value === 'daysOfCover' ? 'asc' : 'desc') }}>
            <SelectTrigger className='h-9 w-[190px]' aria-label={t('Rank by')}>
              <span className='text-muted-foreground'>{t('Rank by')}:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.abcClass || ALL} onValueChange={(value) => onFiltersChange({ ...filters, abcClass: value === ALL ? '' : value })}>
            <SelectTrigger className='h-9 w-[130px]' aria-label={t('Class')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('All classes')}</SelectItem>
              <SelectItem value='A'>{t('Class A')}</SelectItem>
              <SelectItem value='B'>{t('Class B')}</SelectItem>
              <SelectItem value='C'>{t('Class C')}</SelectItem>
              <SelectItem value='none'>{t('No net sales')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.movement || ALL} onValueChange={(value) => onFiltersChange({ ...filters, movement: value === ALL ? '' : value })}>
            <SelectTrigger className='h-9 w-[150px]' aria-label={t('Movement')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('All movement')}</SelectItem>
              {Object.entries(MOVEMENT_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {t(meta.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CategoryFilter
            value={filters.categoryId}
            onChange={(categoryId) => onFiltersChange({ ...filters, categoryId })}
            categories={shown?.facets?.categories ?? []}
            uncategorizedCount={shown?.facets?.uncategorized ?? 0}
          />
          {activeFilterCount > 0 ? (
            <Button
              variant='ghost'
              size='sm'
              className='h-9 gap-1'
              onClick={() => {
                setSearchInput('')
                onFiltersChange({ abcClass: '', movement: '', categoryId: '' })
              }}
            >
              <X className='h-3.5 w-3.5' />
              {t('Clear')} ({activeFilterCount})
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='px-0'>
        <div className={cn('overflow-x-auto transition-opacity', isFetching && !isLoading && 'opacity-60')} aria-busy={isFetching}>
          <Table className='min-w-[980px]'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12 pl-6 text-right'>#</TableHead>
                <TableHead>
                  <SortHeader field='name' label={t('Product')} align='left' />
                </TableHead>
                <TableHead className='w-14 text-center'>{t('Class')}</TableHead>
                <TableHead className='text-right'>
                  <SortHeader field='netRevenue' label={t('Net sales')} />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader field='netProfit' label={t('Gross profit')} />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader field='netUnits' label={t('Units sold')} />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader field='revenueGrowth' label={t('Growth')} />
                </TableHead>
                <TableHead className='text-right'>
                  <SortHeader field='currentStock' label={t('Stock')} />
                </TableHead>
                <TableHead className='pr-6'>{t('Movement')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9} className='px-6'>
                      <Skeleton className='h-9 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={9} className='py-10 text-center text-sm text-muted-foreground'>
                    {t('Could not load rankings.')}{' '}
                    <Button variant='link' className='h-auto p-0' onClick={() => refetch()}>
                      {t('Try again')}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className='py-10 text-center text-sm text-muted-foreground'>
                    {activeFilterCount > 0 ? t('No products match these filters.') : t('No products yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => {
                  const rank = rankFor(row, index)
                  const unit = row.unit ? getUnitLabel(row.unit) : ''
                  return (
                    <TableRow key={row.productId} className={cn(!row.isActive && 'text-muted-foreground')}>
                      <TableCell className='pl-6 text-right text-xs font-semibold tabular-nums text-muted-foreground'>
                        {rank ?? '—'}
                      </TableCell>
                      <TableCell className='max-w-[280px]'>
                        <Link
                          to='/products/$productId'
                          params={{ productId: row.productId }}
                          className='group flex items-center gap-2.5 focus-visible:outline-none'
                        >
                          <ProductThumb url={row.image?.url} name={row.name} />
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-medium group-hover:underline group-focus-visible:underline' title={row.name}>
                              {row.name}
                            </p>
                            <p className='truncate text-xs text-muted-foreground'>
                              {showUrdu && row.nameUrdu ? (
                                <span dir='rtl' className='mr-1.5'>
                                  {row.nameUrdu}
                                </span>
                              ) : null}
                              {[row.categories[0]?.name, row.brandName].filter(Boolean).join(' · ') || row.barcode || row.sku}
                            </p>
                          </div>
                          {!row.isActive ? (
                            <Badge variant='outline' className='ml-1 shrink-0 text-[10px]'>
                              {t('Inactive')}
                            </Badge>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className='text-center'>
                        <AbcBadge value={row.abcClass} />
                      </TableCell>
                      <TableCell className='text-right'>
                        <p className='text-sm font-semibold tabular-nums'>{formatMoney(row.netRevenue)}</p>
                        <p className='text-xs text-muted-foreground tabular-nums'>
                          {row.revenueShare > 0 ? t('{{share}} of sales', { share: formatPct(row.revenueShare) }) : '—'}
                        </p>
                      </TableCell>
                      <TableCell className='text-right'>
                        <p className={cn('text-sm font-medium tabular-nums', row.netProfit < 0 && 'text-rose-600 dark:text-rose-400')}>
                          {formatMoney(row.netProfit)}
                        </p>
                        <p className='text-xs text-muted-foreground tabular-nums'>
                          {row.margin !== null ? t('{{margin}} margin', { margin: formatPct(row.margin) }) : '—'}
                        </p>
                      </TableCell>
                      <TableCell className='text-right'>
                        <p className='text-sm tabular-nums'>
                          {formatQty(row.netUnits)} <span className='text-xs text-muted-foreground'>{unit}</span>
                        </p>
                        <p className='text-xs text-muted-foreground tabular-nums'>
                          {row.velocity > 0 ? t('{{rate}}/day', { rate: formatQty(row.velocity) }) : '—'}
                        </p>
                      </TableCell>
                      <TableCell className='text-right'>
                        <GrowthIndicator value={row.revenueGrowth} isNew={row.isNew} />
                        <p className='text-xs text-muted-foreground tabular-nums'>
                          {row.previous.netRevenue > 0 ? t('was {{amount}}', { amount: formatMoney(row.previous.netRevenue) }) : ''}
                        </p>
                      </TableCell>
                      <TableCell className='text-right'>
                        <p className={cn('text-sm tabular-nums', row.currentStock <= 0 && 'text-rose-600 dark:text-rose-400')}>
                          {formatQty(row.currentStock)}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {row.daysOfCover !== null ? t('{{days}} left', { days: formatDays(row.daysOfCover, t) }) : formatMoney(row.stockValue)}
                        </p>
                      </TableCell>
                      <TableCell className='pr-6'>
                        <MovementBadge value={row.movement} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {shown ? (
          <div className='px-6'>
            <SimplePagination
              currentPage={shown.page}
              totalPages={shown.totalPages}
              totalResults={shown.totalResults}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              pageSizeOptions={[20, 50, 100]}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
