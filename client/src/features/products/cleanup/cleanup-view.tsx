import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  BadgeDollarSign,
  Copy,
  EyeOff,
  Hourglass,
  Layers,
  Loader2,
  Package,
  PackageX,
  Power,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatAppDate } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { AppDispatch } from '@/stores/store'
import { bulkUpdateProducts } from '@/stores/product.slice'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { productListApi } from '@/stores/productList.api'
import {
  useGetCleanupItemsQuery,
  useGetCleanupOverviewQuery,
  type CleanupBucket,
  type CleanupCategoryRow,
  type CleanupItem,
} from '@/stores/inventoryCleanup.api'
import { BulkDeleteDialog } from '../components/bulk-delete-dialog'
import { SourceBadge } from '../components/similar-products-panel'
import { AddToListMenu } from '../lists/product-lists-bar'
import type { Product } from '../data/schema'

/**
 * Products → "Clean up": the category-wise view for pruning a catalogue. Top: one card per
 * clean-up bucket (count + money held). Middle: every category with its products, what is
 * in / out of stock and the value it holds, plus the chosen bucket for that category.
 * Bottom: the products in the chosen bucket (+ category), ready to switch off, put on a
 * list (e.g. "Do not order") or delete.
 */

const BUCKET_META: Record<CleanupBucket, { label: string; hint: string; action: string; icon: LucideIcon; tone: string }> = {
  dead_stock: {
    label: 'Dead stock',
    hint: 'Holding stock, nothing sold',
    action: 'Clear it: discount, return to the supplier, or stop re-ordering.',
    icon: Hourglass,
    tone: 'text-rose-600 dark:text-rose-400',
  },
  zero_unsold: {
    label: 'Empty & unsold',
    hint: 'No stock and no sales',
    action: 'Safe to switch off — they only clutter lists and pickers.',
    icon: PackageX,
    tone: 'text-amber-600 dark:text-amber-400',
  },
  inactive_with_stock: {
    label: 'Off but in stock',
    hint: 'Switched off, still holding stock',
    action: 'Money out of sight — switch back on to sell, or write the stock off.',
    icon: EyeOff,
    tone: 'text-violet-600 dark:text-violet-400',
  },
  below_cost: {
    label: 'Below cost',
    hint: 'Sale price under the cost',
    action: 'Every sale loses money — fix the price or the cost.',
    icon: BadgeDollarSign,
    tone: 'text-red-600 dark:text-red-400',
  },
  missing_price: {
    label: 'No sale price',
    hint: 'Active with price 0',
    action: 'Set a price before it is sold for nothing.',
    icon: Ban,
    tone: 'text-orange-600 dark:text-orange-400',
  },
  duplicate: {
    label: 'Duplicates',
    hint: 'Same name more than once',
    action: 'Keep one, move its stock, switch off or delete the rest.',
    icon: Copy,
    tone: 'text-sky-600 dark:text-sky-400',
  },
}
const BUCKETS = Object.keys(BUCKET_META) as CleanupBucket[]
const IDLE_KEY = 'productCleanupIdleDays'
const ALL_CATEGORIES = 'all'

function readIdleDays(): number {
  try {
    const v = Number(localStorage.getItem(IDLE_KEY))
    return [30, 60, 90, 180, 365].includes(v) ? v : 90
  } catch {
    return 90
  }
}

/** Share bar: this category's slice of all stock value. */
function ShareBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0
  return (
    <div className='flex min-w-[96px] items-center gap-2'>
      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted'>
        <div className='h-full rounded-full bg-primary' style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className='w-10 text-right text-xs tabular-nums text-muted-foreground'>{pct}%</span>
    </div>
  )
}

export function CleanupView() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const [idleDays, setIdleDaysState] = useState(readIdleDays)
  const [bucket, setBucket] = useState<CleanupBucket>('dead_stock')
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)
  const [sortBy, setSortBy] = useState<'stockValue' | 'idle' | 'name' | 'stock'>('stockValue')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [selected, setSelected] = useState<Record<string, CleanupItem>>({})
  // Bumped after this screen changes products — reads past the server's analytics cache.
  const [nonce, setNonce] = useState<number | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const itemsRef = useRef<HTMLDivElement>(null)

  const setIdleDays = (value: number) => {
    setIdleDaysState(value)
    try {
      localStorage.setItem(IDLE_KEY, String(value))
    } catch {
      // Not remembered — fine.
    }
  }

  useEffect(() => {
    setPage(1)
    setSelected({})
  }, [idleDays, bucket, categoryId, search, sortBy])

  const overview = useGetCleanupOverviewQuery({ idleDays, nonce })
  const items = useGetCleanupItemsQuery({
    idleDays,
    bucket,
    ...(categoryId !== ALL_CATEGORIES ? { categoryId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    sortBy,
    page,
    limit,
    nonce,
  })

  const totals = overview.data?.totals
  const categories = overview.data?.categories ?? []
  const totalValue = totals?.stockValue ?? 0
  const rows = items.data?.results ?? []
  const selectedList = Object.values(selected)
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected[r.id])
  const categoryName = useMemo(
    () => (categoryId === ALL_CATEGORIES ? t('All categories') : categories.find((c) => (c.categoryId ?? 'uncategorized') === categoryId)?.categoryName || ''),
    [categoryId, categories, t],
  )

  const refreshAfterChange = () => {
    setSelected({})
    setNonce(Date.now())
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(productListApi.util.invalidateTags(['ProductList', 'ProductListFlags']))
  }

  const setActive = async (isActive: boolean) => {
    if (!selectedList.length) return
    setBusy(true)
    try {
      const result = await dispatch(bulkUpdateProducts({ products: selectedList.map((p) => ({ id: p.id, isActive })) }))
      if (result.meta.requestStatus !== 'fulfilled') throw new Error('failed')
      toast.success(isActive ? t('{{n}} product(s) switched on', { n: String(selectedList.length) }) : t('{{n}} product(s) switched off', { n: String(selectedList.length) }))
      refreshAfterChange()
    } catch {
      toast.error(t('Could not update the products'))
    } finally {
      setBusy(false)
    }
  }

  const pickBucket = (next: CleanupBucket, nextCategory?: string) => {
    setBucket(next)
    if (nextCategory !== undefined) setCategoryId(nextCategory)
    requestAnimationFrame(() => itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const meta = BUCKET_META[bucket]

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          {t('Find what to prune: stock that is not selling, products nobody needs, prices that lose money and items entered twice — category by category.')}
        </p>
        <div className='flex items-center gap-2'>
          <span className='text-xs text-muted-foreground'>{t('Not sold in')}</span>
          <Select value={String(idleDays)} onValueChange={(v) => setIdleDays(Number(v))}>
            <SelectTrigger className='h-9 w-[130px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[30, 60, 90, 180, 365].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t('{{n}} days', { n: String(d) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant='outline'
            size='icon'
            className='h-9 w-9'
            onClick={() => setNonce(Date.now())}
            disabled={overview.isFetching}
            aria-label={t('Refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* One card per bucket: count + the money it holds. */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6'>
        {BUCKETS.map((b) => {
          const m = BUCKET_META[b]
          const Icon = m.icon
          const data = totals?.buckets[b]
          const active = b === bucket
          return (
            <button
              key={b}
              type='button'
              onClick={() => pickBucket(b)}
              aria-pressed={active}
              className={cn(
                'rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50',
                active && 'border-primary ring-1 ring-primary',
              )}
            >
              <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Icon className={cn('h-4 w-4 shrink-0', m.tone)} />
                <span className='truncate'>{t(m.label)}</span>
              </div>
              {overview.isLoading ? (
                <Skeleton className='mt-2 h-7 w-16' />
              ) : (
                <>
                  <p className='mt-1 text-2xl font-semibold tabular-nums'>{(data?.count ?? 0).toLocaleString()}</p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {data && data.stockValue > 0 ? `${formatMoney(data.stockValue)} ${t('in stock')}` : t(m.hint)}
                  </p>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Category-wise inventory: items and value per category, and the chosen bucket. */}
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Layers className='h-4 w-4 text-muted-foreground' />
            {t('Inventory by category')}
          </CardTitle>
          {totals && (
            <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
              <span>
                <span className='text-muted-foreground'>{t('Products')}:</span> <b className='tabular-nums'>{totals.totalProducts.toLocaleString()}</b>
              </span>
              <span>
                <span className='text-muted-foreground'>{t('In stock')}:</span>{' '}
                <b className='tabular-nums text-emerald-700 dark:text-emerald-400'>{totals.inStockProducts.toLocaleString()}</b>
              </span>
              <span>
                <span className='text-muted-foreground'>{t('Stock value')}:</span> <b className='tabular-nums'>{formatMoney(totals.stockValue)}</b>
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {overview.isLoading ? (
            <div className='space-y-2'>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className='h-9 w-full' />
              ))}
            </div>
          ) : (
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Category')}</TableHead>
                    <TableHead className='text-right'>{t('Products')}</TableHead>
                    <TableHead className='text-right'>{t('In stock')}</TableHead>
                    <TableHead className='text-right'>{t('Out of stock')}</TableHead>
                    <TableHead className='text-right'>{t('Stock qty')}</TableHead>
                    <TableHead className='text-right'>{t('Stock value')}</TableHead>
                    <TableHead>{t('Share of value')}</TableHead>
                    <TableHead className='text-right'>
                      <span className={cn('inline-flex items-center gap-1', meta.tone)}>
                        <meta.icon className='h-3.5 w-3.5' />
                        {t(meta.label)}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className='h-20 text-center text-muted-foreground'>
                        {t('No products yet')}
                      </TableCell>
                    </TableRow>
                  )}
                  {categories.map((row: CleanupCategoryRow) => {
                    const key = row.categoryId ?? 'uncategorized'
                    const b = row.buckets[bucket]
                    const active = categoryId === key
                    return (
                      <TableRow
                        key={key}
                        className={cn('cursor-pointer', active && 'bg-primary/5')}
                        onClick={() => pickBucket(bucket, active ? ALL_CATEGORIES : key)}
                      >
                        <TableCell className='font-medium'>{t(row.categoryName)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{row.totalProducts.toLocaleString()}</TableCell>
                        <TableCell className='text-right tabular-nums text-emerald-700 dark:text-emerald-400'>{row.inStockProducts.toLocaleString()}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', row.outOfStockProducts > 0 && 'text-rose-600 dark:text-rose-400')}>
                          {row.outOfStockProducts.toLocaleString()}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>{row.stockQuantity.toLocaleString()}</TableCell>
                        <TableCell className='text-right font-semibold tabular-nums'>{formatMoney(row.stockValue)}</TableCell>
                        <TableCell>
                          <ShareBar value={row.stockValue} total={totalValue} />
                        </TableCell>
                        <TableCell className='text-right'>
                          {b.count > 0 ? (
                            <span className='inline-flex flex-col items-end'>
                              <span className={cn('font-semibold tabular-nums', meta.tone)}>{b.count.toLocaleString()}</span>
                              {b.stockValue > 0 && <span className='text-[11px] tabular-nums text-muted-foreground'>{formatMoney(b.stockValue)}</span>}
                            </span>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The products to act on. */}
      <div ref={itemsRef} className='scroll-mt-4'>
        <Card>
          <CardHeader className='space-y-3 pb-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex flex-wrap items-center gap-2 text-base'>
                  <meta.icon className={cn('h-4 w-4', meta.tone)} />
                  {t(meta.label)}
                  <span className='font-normal text-muted-foreground'>· {categoryName}</span>
                  {items.isFetching && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
                </CardTitle>
                <p className='mt-1 text-xs text-muted-foreground'>{t(meta.action)}</p>
              </div>
              {items.data && (
                <div className='text-right text-xs'>
                  <p>
                    <b className='tabular-nums'>{items.data.totalResults.toLocaleString()}</b> {t('products')}
                  </p>
                  {items.data.totalStockValue > 0 && <p className='text-muted-foreground'>{formatMoney(items.data.totalStockValue)} {t('in stock')}</p>}
                </div>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <div className='relative min-w-[200px] flex-1'>
                <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('search_products')} className='h-9 pl-8' />
              </div>
              {categoryId !== ALL_CATEGORIES && (
                <Button variant='ghost' size='sm' className='h-9' onClick={() => setCategoryId(ALL_CATEGORIES)}>
                  {t('All categories')}
                </Button>
              )}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className='h-9 w-[170px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='stockValue'>{t('Most value first')}</SelectItem>
                  <SelectItem value='idle'>{t('Longest unsold first')}</SelectItem>
                  <SelectItem value='stock'>{t('Most stock first')}</SelectItem>
                  <SelectItem value='name'>{t('Name A–Z')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedList.length > 0 && (
              <div className='flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2'>
                <span className='text-sm font-medium'>{t('{{n}} selected', { n: String(selectedList.length) })}</span>
                <Can permission='editProducts'>
                  {selectedList.some((p) => p.isActive) && (
                    <Button size='sm' variant='outline' className='h-8 gap-1.5' disabled={busy} onClick={() => setActive(false)}>
                      <Power className='h-3.5 w-3.5' />
                      {t('Switch off')}
                    </Button>
                  )}
                  {selectedList.some((p) => !p.isActive) && (
                    <Button size='sm' variant='outline' className='h-8 gap-1.5' disabled={busy} onClick={() => setActive(true)}>
                      <Power className='h-3.5 w-3.5' />
                      {t('Switch on')}
                    </Button>
                  )}
                  <AddToListMenu products={selectedList} />
                </Can>
                <Can permission='deleteProducts'>
                  <Button size='sm' variant='destructive' className='h-8 gap-1.5' onClick={() => setDeleteOpen(true)}>
                    <Trash2 className='h-3.5 w-3.5' />
                    {t('Delete')}
                  </Button>
                </Can>
                <Button size='sm' variant='ghost' className='h-8' onClick={() => setSelected({})}>
                  {t('Clear')}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-8'>
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(checked) =>
                          setSelected((prev) => {
                            const next = { ...prev }
                            rows.forEach((r) => {
                              if (checked) next[r.id] = r
                              else delete next[r.id]
                            })
                            return next
                          })
                        }
                        aria-label={t('Select all on this page')}
                      />
                    </TableHead>
                    <TableHead>{t('Product')}</TableHead>
                    <TableHead>{t('Category')}</TableHead>
                    <TableHead className='text-right'>{t('Stock')}</TableHead>
                    <TableHead className='text-right'>{t('Value')}</TableHead>
                    <TableHead className='text-right'>{t('Cost')}</TableHead>
                    <TableHead className='text-right'>{t('Price')}</TableHead>
                    <TableHead>{t('Last sold')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.isLoading &&
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}>
                          <Skeleton className='h-6 w-full' />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!items.isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className='h-24 text-center text-muted-foreground'>
                        {t('Nothing here — well kept!')}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.id} data-state={selected[r.id] ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[r.id]}
                          onCheckedChange={(checked) =>
                            setSelected((prev) => {
                              const next = { ...prev }
                              if (checked) next[r.id] = r
                              else delete next[r.id]
                              return next
                            })
                          }
                          aria-label={t('Select {{name}}', { name: r.name })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className='flex min-w-[180px] items-center gap-2'>
                          {r.image?.url ? (
                            <img src={r.image.url} alt='' className='h-7 w-7 shrink-0 rounded-md border object-cover' />
                          ) : (
                            <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted'>
                              <Package className='h-3.5 w-3.5 text-muted-foreground' />
                            </span>
                          )}
                          <div className='min-w-0'>
                            <Link to='/products/$productId' params={{ productId: r.id }} className='block truncate text-sm font-medium hover:text-primary hover:underline'>
                              {r.name}
                            </Link>
                            <div className='flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground'>
                              {r.barcode && <span className='font-mono'>{r.barcode}</span>}
                              <SourceBadge source={r.source} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>{r.categories.map((c) => c.name).join(', ') || t('Uncategorized')}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.hasVariants ? t('variants') : r.currentStock.toLocaleString()}</TableCell>
                      <TableCell className='text-right font-medium tabular-nums'>{formatMoney(r.stockValue)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatMoney(r.cost)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', r.price > 0 && r.cost > 0 && r.price < r.cost && 'font-semibold text-red-600 dark:text-red-400')}>
                        {formatMoney(r.price)}
                      </TableCell>
                      <TableCell className='whitespace-nowrap text-xs'>
                        {r.lastSoldAt ? (
                          <span title={formatAppDate(r.lastSoldAt)}>
                            {formatAppDate(r.lastSoldAt)}
                            {r.idleDays != null && <span className='text-muted-foreground'> · {t('{{n}}d ago', { n: String(r.idleDays) })}</span>}
                          </span>
                        ) : r.unitsSold > 0 ? (
                          <span className='text-emerald-700 dark:text-emerald-400'>{t('Selling')}</span>
                        ) : (
                          <span className='text-muted-foreground'>{t('Not in the last year')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.isActive ? (
                          <Badge variant='outline' className='text-[10px]'>{t('Active')}</Badge>
                        ) : (
                          <Badge variant='outline' className='text-[10px] text-muted-foreground'>{t('Inactive')}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SimplePagination
              currentPage={page}
              totalPages={items.data?.totalPages || 1}
              totalResults={items.data?.totalResults}
              limit={limit}
              onLimitChange={(n) => {
                setLimit(n)
                setPage(1)
              }}
              onPageChange={setPage}
              pageSizeOptions={[25, 50, 100, 250]}
              className='mt-3'
            />
          </CardContent>
        </Card>
      </div>

      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        products={selectedList.map((p) => ({ ...p, _id: p.id })) as unknown as Product[]}
        onDeleted={refreshAfterChange}
      />
    </div>
  )
}
