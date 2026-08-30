import { Fragment, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Package,
  Search,
  Wallet,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import type { AppDispatch } from '@/stores/store'
import { fetchProducts } from '@/stores/product.slice'
import LongText from '@/components/long-text'
import { getDisplayStock, getDisplayStockValue } from '@/lib/product-stock-display'
import { UNCATEGORIZED_CATEGORY } from './category-filter-combobox'
import type { Product } from '../data/schema'

export interface CategoryBreakdownRow {
  categoryId: string | null
  categoryName: string
  totalProducts: number
  totalStockQuantity: number
  totalStockValue: number
}

interface CategoryBreakdownProps {
  data: CategoryBreakdownRow[]
  loading: boolean
  /** Jump to a single category's filtered product list (sets the page's category filter). */
  onSelectCategory: (categoryId: string) => void
}

const TOP_N = 10
/** Inline preview page size — paginated (not capped) so every product in even the
 *  largest category (thousands of rows) stays reachable without dumping them all into
 *  the DOM at once, the same tradeoff the Inventory Report's pagination makes. */
const PREVIEW_PAGE_SIZE = 10
type SortKey = 'categoryName' | 'totalProducts' | 'totalStockQuantity' | 'totalStockValue'

interface PreviewState {
  loading: boolean
  error: boolean
  products: Product[]
  totalResults: number
  page: number
}

function truncateLabel(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategoryBreakdownRow }> }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className='rounded-lg border bg-card px-3 py-2 text-xs shadow-md'>
      <p className='font-medium text-foreground'>{row.categoryName}</p>
      <p className='text-muted-foreground'>Products: <span className='font-medium text-foreground'>{row.totalProducts.toLocaleString()}</span></p>
      <p className='text-muted-foreground'>Qty: <span className='font-medium text-foreground'>{row.totalStockQuantity.toLocaleString()}</span></p>
      <p className='text-muted-foreground'>Value: <span className='font-medium text-foreground'>{row.totalStockValue.toLocaleString()}</span></p>
    </div>
  )
}

/** Category-wise rollup for the Products page's "All Categories" view — a top-10 bar
 *  chart (magnitude comparison, one sequential hue) plus a full searchable/sortable
 *  table underneath so every category (not just the top 10) stays reachable. Each row
 *  expands inline to a quick product preview (lazy-fetched, cached per category) so a
 *  category can be inspected without leaving this view. */
export function CategoryBreakdown({ data, loading, onSelectCategory }: CategoryBreakdownProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('totalStockValue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({})

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, row) => ({
          categories: acc.categories + 1,
          products: acc.products + row.totalProducts,
          value: acc.value + row.totalStockValue,
        }),
        { categories: 0, products: 0, value: 0 }
      ),
    [data]
  )

  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.totalStockValue - a.totalStockValue)
        .slice(0, TOP_N)
        .map((row) => ({ ...row, label: truncateLabel(row.categoryName) }))
        .reverse(), // Recharts vertical bars render top-to-bottom in array order — reverse so the highest value sits at the top.
    [data]
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = q ? data.filter((row) => row.categoryName.toLowerCase().includes(q)) : data
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'categoryName') return a.categoryName.localeCompare(b.categoryName) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
  }, [data, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'categoryName' ? 'asc' : 'desc')
    }
  }

  const rowKey = (row: CategoryBreakdownRow) => row.categoryId ?? UNCATEGORIZED_CATEGORY

  const handleSelect = (row: CategoryBreakdownRow) => onSelectCategory(rowKey(row))

  const loadPreviewPage = (key: string, page: number) => {
    setPreviews((prev) => ({
      ...prev,
      [key]: { loading: true, error: false, products: prev[key]?.products || [], totalResults: prev[key]?.totalResults || 0, page },
    }))
    dispatch(fetchProducts({ category: key, page, limit: PREVIEW_PAGE_SIZE, sortBy: 'stockQuantity:desc' }))
      .then((result) => {
        const payload = result.payload as { results?: Product[]; totalResults?: number } | undefined
        setPreviews((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            error: false,
            products: payload?.results || [],
            totalResults: payload?.totalResults || 0,
            page,
          },
        }))
      })
      .catch(() => {
        setPreviews((prev) => ({ ...prev, [key]: { loading: false, error: true, products: [], totalResults: 0, page } }))
      })
  }

  const toggleExpand = (row: CategoryBreakdownRow) => {
    const key = rowKey(row)
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    if (!previews[key]) loadPreviewPage(key, 1)
  }

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey !== column ? (
      <ArrowUpDown className='ml-1 h-3 w-3 text-muted-foreground/50' />
    ) : sortDir === 'asc' ? (
      <ArrowUp className='ml-1 h-3 w-3' />
    ) : (
      <ArrowDown className='ml-1 h-3 w-3' />
    )

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-[360px] w-full' />
        <Skeleton className='h-[400px] w-full' />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
          <Layers className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>{t('categories')}:</span>
          <span className='font-semibold tabular-nums'>{totals.categories.toLocaleString()}</span>
        </div>
        <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
          <Boxes className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>{t('total_products')}:</span>
          <span className='font-semibold tabular-nums'>{totals.products.toLocaleString()}</span>
        </div>
        <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
          <Wallet className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>{t('total_value_of_stock')}:</span>
          <span className='font-semibold tabular-nums'>{totals.value.toLocaleString()}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('Top categories by value')}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>{t('no_results')}</p>
          ) : (
            <ResponsiveContainer width='100%' height={Math.max(chartData.length * 36, 200)}>
              <BarChart data={chartData} layout='vertical' margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray='3 3' horizontal={false} className='opacity-50' />
                <XAxis type='number' tickFormatter={(v: number) => v.toLocaleString()} stroke='currentColor' className='text-xs text-muted-foreground' tickLine={false} axisLine={false} />
                <YAxis type='category' dataKey='label' width={140} stroke='currentColor' className='text-xs text-muted-foreground' tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ className: 'fill-muted' }} />
                <Bar
                  dataKey='totalStockValue'
                  fill='currentColor'
                  className='cursor-pointer fill-primary'
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                  onClick={(row: unknown) => onSelectCategory(rowKey(row as CategoryBreakdownRow))}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <CardTitle className='text-base'>{t('all_categories')}</CardTitle>
            <div className='relative w-full max-w-xs'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_categories')}
                className='pl-9'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-8' />
                  <TableHead>
                    <button type='button' onClick={() => toggleSort('categoryName')} className='flex items-center hover:text-foreground'>
                      {t('category')} <SortIcon column='categoryName' />
                    </button>
                  </TableHead>
                  <TableHead className='text-right'>
                    <button type='button' onClick={() => toggleSort('totalProducts')} className='ml-auto flex items-center hover:text-foreground'>
                      {t('total_products')} <SortIcon column='totalProducts' />
                    </button>
                  </TableHead>
                  <TableHead className='text-right'>
                    <button type='button' onClick={() => toggleSort('totalStockQuantity')} className='ml-auto flex items-center hover:text-foreground'>
                      {t('stock')} <SortIcon column='totalStockQuantity' />
                    </button>
                  </TableHead>
                  <TableHead className='text-right'>
                    <button type='button' onClick={() => toggleSort('totalStockValue')} className='ml-auto flex items-center hover:text-foreground'>
                      {t('value')} <SortIcon column='totalStockValue' />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className='h-24 text-center text-muted-foreground'>
                      {t('no_results')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const key = rowKey(row)
                    const isOpen = expandedKeys.has(key)
                    const preview = previews[key]
                    return (
                      <Fragment key={key}>
                        <TableRow className='cursor-pointer hover:bg-muted/40' onClick={() => toggleExpand(row)}>
                          <TableCell className='w-8'>
                            <Button variant='ghost' size='icon' className='h-6 w-6'>
                              {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                            </Button>
                          </TableCell>
                          <TableCell className='font-medium'>{row.categoryName}</TableCell>
                          <TableCell className='text-right tabular-nums'>{row.totalProducts.toLocaleString()}</TableCell>
                          <TableCell className='text-right tabular-nums'>{row.totalStockQuantity.toLocaleString()}</TableCell>
                          <TableCell className='text-right font-semibold tabular-nums'>{row.totalStockValue.toLocaleString()}</TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className='bg-muted/10 hover:bg-muted/10'>
                            <TableCell />
                            <TableCell colSpan={4} className='py-3'>
                              <div className='overflow-hidden rounded-lg border bg-background shadow-sm'>
                                <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2'>
                                  <div className='flex items-center gap-2'>
                                    <Package className='h-3.5 w-3.5 text-blue-600' />
                                    <span className='text-xs font-semibold text-muted-foreground'>
                                      {row.categoryName} · {row.totalProducts.toLocaleString()} {row.totalProducts === 1 ? t('product') : t('products')}
                                    </span>
                                  </div>
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    className='h-7 gap-1 text-xs'
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSelect(row)
                                    }}
                                  >
                                    {t('View all in this category')}
                                    <ArrowRight className='h-3 w-3' />
                                  </Button>
                                </div>
                                {preview?.loading ? (
                                  <div className='space-y-2 p-3'>
                                    <Skeleton className='h-8 w-full' />
                                    <Skeleton className='h-8 w-full' />
                                    <Skeleton className='h-8 w-full' />
                                  </div>
                                ) : preview?.error ? (
                                  <p className='p-4 text-center text-xs text-muted-foreground'>{t('Failed to load products')}</p>
                                ) : !preview || preview.products.length === 0 ? (
                                  <p className='p-4 text-center text-xs text-muted-foreground'>{t('no_results')}</p>
                                ) : (
                                  <div className='overflow-x-auto'>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className='hover:bg-transparent'>
                                        <TableHead className='h-8 text-xs'>{t('product')}</TableHead>
                                        <TableHead className='h-8 text-xs'>{t('barcode')}</TableHead>
                                        <TableHead className='h-8 text-xs'>{t('brand')}</TableHead>
                                        <TableHead className='h-8 text-right text-xs'>{t('cost')}</TableHead>
                                        <TableHead className='h-8 text-right text-xs'>{t('price')}</TableHead>
                                        <TableHead className='h-8 text-right text-xs'>{t('stock')}</TableHead>
                                        <TableHead className='h-8 text-right text-xs'>{t('value')}</TableHead>
                                        <TableHead className='h-8 text-xs'>{t('status')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {preview.products.map((product) => {
                                        const stock = getDisplayStock(product)
                                        const productId = product._id || product.id
                                        const brand = product.brandId
                                        const brandName = brand && typeof brand === 'object' ? brand.name : undefined
                                        return (
                                          <TableRow key={productId}>
                                            <TableCell className='py-1.5'>
                                              <div className='flex min-w-0 items-center gap-2'>
                                                {product.image?.url ? (
                                                  <img src={product.image.url} alt={product.name} className='h-6 w-6 shrink-0 rounded-full object-cover' />
                                                ) : (
                                                  <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted'>
                                                    <Package className='h-3 w-3 text-muted-foreground' />
                                                  </div>
                                                )}
                                                <LongText className='max-w-[220px] text-xs'>{product.name}</LongText>
                                              </div>
                                            </TableCell>
                                            <TableCell className='py-1.5 font-mono text-xs text-muted-foreground'>{product.barcode || 'N/A'}</TableCell>
                                            <TableCell className='py-1.5 text-xs text-muted-foreground'>{brandName || '-'}</TableCell>
                                            <TableCell className='py-1.5 text-right text-xs tabular-nums'>{(product.cost ?? 0).toLocaleString()}</TableCell>
                                            <TableCell className='py-1.5 text-right text-xs tabular-nums'>{(product.price ?? 0).toLocaleString()}</TableCell>
                                            <TableCell className='py-1.5 text-right text-xs tabular-nums'>{stock.toLocaleString()}</TableCell>
                                            <TableCell className='py-1.5 text-right text-xs font-medium tabular-nums'>{getDisplayStockValue(product).toLocaleString()}</TableCell>
                                            <TableCell className='py-1.5'>
                                              {stock === 0 ? (
                                                <Badge variant='destructive' className='text-[10px]'>{t('out_of_stock')}</Badge>
                                              ) : (
                                                <Badge variant='outline' className='border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'>
                                                  {t('in_stock')}
                                                </Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>
                                  </div>
                                )}
                                {preview && !preview.loading && !preview.error && preview.products.length > 0 && (
                                  <div className='flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2'>
                                    <span className='text-xs text-muted-foreground'>
                                      {t('Showing {{shown}} of {{total}}', {
                                        shown: `${(preview.page - 1) * PREVIEW_PAGE_SIZE + 1}-${(preview.page - 1) * PREVIEW_PAGE_SIZE + preview.products.length}`,
                                        total: preview.totalResults,
                                      })}
                                    </span>
                                    {preview.totalResults > PREVIEW_PAGE_SIZE && (
                                      <div className='flex items-center gap-1'>
                                        <Button
                                          variant='outline'
                                          size='icon'
                                          className='h-6 w-6'
                                          disabled={preview.page <= 1}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            loadPreviewPage(key, preview.page - 1)
                                          }}
                                        >
                                          <ChevronLeft className='h-3.5 w-3.5' />
                                        </Button>
                                        <span className='text-xs tabular-nums text-muted-foreground'>
                                          {preview.page} / {Math.max(Math.ceil(preview.totalResults / PREVIEW_PAGE_SIZE), 1)}
                                        </span>
                                        <Button
                                          variant='outline'
                                          size='icon'
                                          className='h-6 w-6'
                                          disabled={preview.page >= Math.ceil(preview.totalResults / PREVIEW_PAGE_SIZE)}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            loadPreviewPage(key, preview.page + 1)
                                          }}
                                        >
                                          <ChevronRight className='h-3.5 w-3.5' />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {preview && !preview.loading && !preview.error && (
                                  <div className='grid grid-cols-3 divide-x border-t bg-muted/20 text-center'>
                                    <div className='px-3 py-2'>
                                      <p className='text-[10px] text-muted-foreground'>{t('total_products')}</p>
                                      <p className='text-sm font-semibold tabular-nums'>{row.totalProducts.toLocaleString()}</p>
                                    </div>
                                    <div className='px-3 py-2'>
                                      <p className='text-[10px] text-muted-foreground'>{t('stock')}</p>
                                      <p className='text-sm font-semibold tabular-nums'>{row.totalStockQuantity.toLocaleString()}</p>
                                    </div>
                                    <div className='px-3 py-2'>
                                      <p className='text-[10px] text-muted-foreground'>{t('value')}</p>
                                      <p className='text-sm font-semibold tabular-nums'>{row.totalStockValue.toLocaleString()}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
