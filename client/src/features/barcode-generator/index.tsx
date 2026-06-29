import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useReactToPrint } from 'react-to-print'
import { Barcode, Printer, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { AppDispatch } from '@/stores/store'
import { fetchProducts } from '@/stores/product.slice'
import { fetchCustomers } from '@/stores/customer.slice'
import { useGetInvoicesQuery, useLazyGetInvoicesQuery } from '@/stores/invoice.api'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'

import { BarcodeSvg } from './components/barcode-svg'
import { BarcodePrintSheet } from './components/barcode-print-sheet'
import type { BarcodeItem, EntityTab } from './types'

const SEARCH_DEBOUNCE_MS = 400
const LIMIT = 20
const MAX_SELECT_ALL = 2000

type RawRecord = Record<string, unknown>

function mapProduct(p: RawRecord): BarcodeItem {
  return {
    id: String(p.id ?? p._id),
    code: String(p.barcode || p.sku || p.id || p._id),
    title: String(p.name),
    subtitle: `Rs${Number(p.price ?? 0).toLocaleString()} · Stock: ${Number(p.stockQuantity ?? 0)}`,
  }
}

function mapCustomer(c: RawRecord): BarcodeItem {
  return {
    id: String(c.id ?? c._id),
    code: String(c.phone || c.id || c._id),
    title: String(c.name),
    subtitle: (c.phone as string) || (c.email as string) || undefined,
  }
}

function mapInvoice(inv: RawRecord): BarcodeItem {
  return {
    id: String(inv.id ?? inv._id),
    code: String(inv.invoiceNumber),
    title: String(inv.invoiceNumber),
    subtitle: inv.customerName || inv.walkInCustomerName
      ? `${inv.customerName || inv.walkInCustomerName} · Rs${Number(inv.total ?? 0).toLocaleString()}`
      : `Rs${Number(inv.total ?? 0).toLocaleString()}`,
  }
}

export default function BarcodeGenerator() {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()

  const [tab, setTab] = useState<EntityTab>('products')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [page, setPage] = useState(1)

  // Selections are kept per-tab so switching tabs doesn't lose progress.
  const [selected, setSelected] = useState<Record<EntityTab, Map<string, BarcodeItem>>>({
    products: new Map(),
    invoices: new Map(),
    customers: new Map(),
  })

  const [settings, setSettings] = useState({
    columns: 3,
    showTitle: true,
    showSubtitle: true,
    showCode: true,
    barHeight: 50,
    barWidth: 2,
  })

  useEffect(() => {
    setPage(1)
  }, [tab, debouncedSearch])

  // --- Products & customers use redux thunks; invoices use RTK Query. ---
  const [thunkItems, setThunkItems] = useState<BarcodeItem[]>([])
  const [thunkTotalPages, setThunkTotalPages] = useState(1)
  const [thunkTotalResults, setThunkTotalResults] = useState(0)
  const [thunkLoading, setThunkLoading] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)

  useEffect(() => {
    if (tab !== 'products' && tab !== 'customers') return
    setThunkLoading(true)
    const q = debouncedSearch.trim()

    const params =
      tab === 'products'
        ? {
            page,
            limit: LIMIT,
            sortBy: 'createdAt:desc',
            ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.product } : {}),
          }
        : {
            page,
            limit: LIMIT,
            sortBy: 'createdAt:desc',
            ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.customer } : {}),
          }

    type ThunkResult = { payload?: { results?: RawRecord[]; totalPages?: number; totalResults?: number } }
    const request: Promise<ThunkResult> = tab === 'products'
      ? (dispatch(fetchProducts(params)) as unknown as Promise<ThunkResult>)
      : (dispatch(fetchCustomers(params)) as unknown as Promise<ThunkResult>)

    request
      .then((res) => {
        const results: RawRecord[] = res.payload?.results || []
        const mapped = tab === 'products' ? results.map(mapProduct) : results.map(mapCustomer)
        setThunkItems(mapped)
        setThunkTotalPages(res.payload?.totalPages || 1)
        setThunkTotalResults(res.payload?.totalResults || mapped.length)
      })
      .catch(() => {
        setThunkItems([])
        setThunkTotalPages(1)
        setThunkTotalResults(0)
        toast.error(t('Failed to load data'))
      })
      .finally(() => setThunkLoading(false))
  }, [tab, page, debouncedSearch, dispatch, t])

  const invoiceParams = useMemo(() => {
    const q = debouncedSearch.trim()
    return { page, limit: LIMIT, ...(q ? { search: q } : {}) }
  }, [page, debouncedSearch])

  const { data: invoiceData, isFetching: invoicesFetching } = useGetInvoicesQuery(invoiceParams, {
    skip: tab !== 'invoices',
  })
  const [triggerGetInvoices] = useLazyGetInvoicesQuery()

  const invoiceItems: BarcodeItem[] = useMemo(() => {
    if (tab !== 'invoices') return []
    const results: RawRecord[] = invoiceData?.results || []
    return results.map(mapInvoice)
  }, [tab, invoiceData])

  const items = tab === 'invoices' ? invoiceItems : thunkItems
  const totalPages = tab === 'invoices' ? invoiceData?.totalPages || 1 : thunkTotalPages
  const totalResults = tab === 'invoices' ? invoiceData?.totalResults || 0 : thunkTotalResults
  const loading = tab === 'invoices' ? invoicesFetching : thunkLoading

  const currentSelection = selected[tab]

  const toggleItem = useCallback((item: BarcodeItem, checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev[tab])
      if (checked) next.set(item.id, item)
      else next.delete(item.id)
      return { ...prev, [tab]: next }
    })
  }, [tab])

  const toggleAllOnPage = useCallback((checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev[tab])
      if (checked) items.forEach((item) => next.set(item.id, item))
      else items.forEach((item) => next.delete(item.id))
      return { ...prev, [tab]: next }
    })
  }, [tab, items])

  const selectAllMatching = useCallback(async () => {
    if (totalResults === 0) return
    if (totalResults > MAX_SELECT_ALL) {
      toast.error(t(`Too many results to select at once (max ${MAX_SELECT_ALL}). Narrow your search first.`))
      return
    }
    setSelectingAll(true)
    try {
      const q = debouncedSearch.trim()
      let fetched: BarcodeItem[] = []
      if (tab === 'invoices') {
        const res = await triggerGetInvoices({ limit: totalResults, page: 1, ...(q ? { search: q } : {}) }).unwrap()
        fetched = (res.results || []).map(mapInvoice)
      } else {
        const params = {
          page: 1,
          limit: totalResults,
          sortBy: 'createdAt:desc',
          ...(q
            ? { search: q, fieldName: tab === 'products' ? LIST_SEARCH_FIELDS.product : LIST_SEARCH_FIELDS.customer }
            : {}),
        }
        const thunk = tab === 'products' ? fetchProducts(params) : fetchCustomers(params)
        const res = (await dispatch(thunk as never)) as unknown as { payload?: { results?: RawRecord[] } }
        const results = res.payload?.results || []
        fetched = tab === 'products' ? results.map(mapProduct) : results.map(mapCustomer)
      }
      setSelected((prev) => {
        const next = new Map(prev[tab])
        fetched.forEach((item) => next.set(item.id, item))
        return { ...prev, [tab]: next }
      })
    } catch {
      toast.error(t('Failed to select all matching items'))
    } finally {
      setSelectingAll(false)
    }
  }, [tab, totalResults, debouncedSearch, dispatch, triggerGetInvoices, t])

  const allOnPageSelected = items.length > 0 && items.every((item) => currentSelection.has(item.id))
  const allMatchingSelected = totalResults > 0 && currentSelection.size >= totalResults

  const allSelectedItems = useMemo(
    () => [...selected.products.values(), ...selected.invoices.values(), ...selected.customers.values()],
    [selected]
  )

  const clearAll = () => setSelected({ products: new Map(), invoices: new Map(), customers: new Map() })

  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Barcodes',
  })

  const onPrint = () => {
    if (allSelectedItems.length === 0) {
      toast.error(t('Select at least one item to print'))
      return
    }
    handlePrint()
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex items-center gap-2'>
        <Barcode className='h-6 w-6 text-primary' />
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{t('Barcode Generator')}</h1>
          <p className='text-sm text-muted-foreground'>
            {t('Generate and print barcodes for products, invoices and customers')}
          </p>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[1fr_360px]'>
        {/* Left: picker */}
        <Card>
          <CardHeader>
            <Tabs value={tab} onValueChange={(v) => setTab(v as EntityTab)}>
              <TabsList>
                <TabsTrigger value='products'>{t('Products')}</TabsTrigger>
                <TabsTrigger value='invoices'>{t('Invoices')}</TabsTrigger>
                <TabsTrigger value='customers'>{t('Customers')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className='relative mt-3'>
              <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('Search by name, code or number...')}
                className='pl-8'
              />
            </div>
          </CardHeader>
          <CardContent>
            {!loading && totalResults > LIMIT && (
              <div className='mb-3 flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm'>
                <span className='text-muted-foreground'>
                  {t('Showing')} {items.length} {t('of')} {totalResults} {t('results')}
                </span>
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0'
                  onClick={selectAllMatching}
                  disabled={selectingAll || allMatchingSelected}
                >
                  {selectingAll
                    ? t('Selecting...')
                    : allMatchingSelected
                      ? t('All matching items selected')
                      : t(`Select all ${totalResults} matching items`)}
                </Button>
              </div>
            )}
            {loading ? (
              <div className='space-y-2'>
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className='h-10 w-full' />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(checked) => toggleAllOnPage(Boolean(checked))}
                        aria-label={t('Select all on page')}
                      />
                    </TableHead>
                    <TableHead>{t('Name / Number')}</TableHead>
                    <TableHead>{t('Details')}</TableHead>
                    <TableHead className='text-right'>{t('Code')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className='cursor-pointer'
                      onClick={() => toggleItem(item, !currentSelection.has(item.id))}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={currentSelection.has(item.id)}
                          onCheckedChange={(checked) => toggleItem(item, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell className='font-medium'>{item.title}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{item.subtitle}</TableCell>
                      <TableCell className='text-right font-mono text-xs'>{item.code}</TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center text-muted-foreground'>
                        {t('No results found')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <SimplePagination
              currentPage={page}
              totalPages={totalPages}
              limit={LIMIT}
              onPageChange={setPage}
              className='mt-3'
            />
          </CardContent>
        </Card>

        {/* Right: selection + settings + preview */}
        <div className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center justify-between text-base'>
                <span>{t('Selected items')}</span>
                <Badge variant='secondary'>{allSelectedItems.length}</Badge>
              </CardTitle>
              <CardDescription>{t('Items chosen across all tabs')}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={clearAll}
                disabled={allSelectedItems.length === 0}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                {t('Clear selection')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>{t('Label settings')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-sm'>{t('Columns per row')}</span>
                <Select
                  value={String(settings.columns)}
                  onValueChange={(v) => setSettings((s) => ({ ...s, columns: Number(v) }))}
                >
                  <SelectTrigger className='h-8 w-20'>
                    <SelectValue>{settings.columns}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className='flex items-center justify-between gap-3 text-sm'>
                <span>{t('Show name')}</span>
                <Checkbox
                  checked={settings.showTitle}
                  onCheckedChange={(c) => setSettings((s) => ({ ...s, showTitle: Boolean(c) }))}
                />
              </label>
              <label className='flex items-center justify-between gap-3 text-sm'>
                <span>{t('Show details')}</span>
                <Checkbox
                  checked={settings.showSubtitle}
                  onCheckedChange={(c) => setSettings((s) => ({ ...s, showSubtitle: Boolean(c) }))}
                />
              </label>
              <label className='flex items-center justify-between gap-3 text-sm'>
                <span>{t('Show code under barcode')}</span>
                <Checkbox
                  checked={settings.showCode}
                  onCheckedChange={(c) => setSettings((s) => ({ ...s, showCode: Boolean(c) }))}
                />
              </label>

              {allSelectedItems[0] && (
                <div className='rounded border p-3'>
                  <p className='mb-2 text-xs font-medium text-muted-foreground'>{t('Preview')}</p>
                  <div className='flex flex-col items-center gap-1 text-center'>
                    {settings.showTitle && (
                      <span className='text-xs font-semibold'>{allSelectedItems[0].title}</span>
                    )}
                    {settings.showSubtitle && allSelectedItems[0].subtitle && (
                      <span className='text-[10px] text-muted-foreground'>{allSelectedItems[0].subtitle}</span>
                    )}
                    <BarcodeSvg
                      value={allSelectedItems[0].code}
                      height={settings.barHeight}
                      width={settings.barWidth}
                      displayValue={settings.showCode}
                    />
                  </div>
                </div>
              )}

              <Button className='w-full' onClick={onPrint}>
                <Printer className='mr-2 h-4 w-4' />
                {t('Print barcodes')} ({allSelectedItems.length})
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className='hidden'>
        <BarcodePrintSheet ref={printRef} items={allSelectedItems} settings={settings} />
      </div>
    </div>
  )
}
