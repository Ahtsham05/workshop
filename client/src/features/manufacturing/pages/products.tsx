import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Award,
  Boxes,
  Check,
  ChevronsUpDown,
  CircleDollarSign,
  ExternalLink,
  Eye,
  FileStack,
  Layers,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  PlusCircle,
  Settings2,
  Shapes,
  Tags,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  manufacturingApi,
  useBulkProductTrackingMutation,
  useGetManufacturingProductStatsQuery,
  useGetManufacturingProductsQuery,
  useGetProductTypeSummaryQuery,
  useLazyGetMatchingManufacturingProductIdsQuery,
  type ManufacturingProduct,
  type ManufacturingProductFilters,
  type ProcurementType,
  type ProductType,
} from '@/stores/manufacturing.api'
import { useGetAllBrandsQuery } from '@/stores/brand.api'
import { fetchCategories } from '@/stores/category.slice'
import { useGetProductQuery } from '@/stores/product.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import type { AppDispatch, RootState } from '@/stores/store'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { ALL_ROWS } from '@/lib/page-size'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImageGalleryViewer } from '@/components/image-gallery-viewer'
import { BulkBrandDialog } from '@/features/products/components/bulk-brand-dialog'
import { BulkCategoryDialog } from '@/features/products/components/bulk-category-dialog'
import { BulkDeleteDialog } from '@/features/products/components/bulk-delete-dialog'
import { ProductSummaryChip } from '@/features/products/components/product-summary-chip'
import { UsersActionDialog } from '@/features/products/components/users-action-dialog'
import { UsersDeleteDialog } from '@/features/products/components/users-delete-dialog'
import { BatchBadge, ProductTypeBadge } from '../components/badges'
import { BulkTypeDialog } from '../components/bulk-type-dialog'
import { DataTable, type Column } from '../components/data-table'
import {
  FilterChips,
  SearchField,
  type ChipOption,
} from '../components/list-controls'
import { EmptyState } from '../components/page'
import { Pager } from '../components/pager'
import { ProductAttributesSheet } from '../components/product-attributes-sheet'
import { ProductBatchesSheet } from '../components/product-batches-sheet'
import { PackSizesSheet } from '../components/pack-sizes-sheet'
import {
  PROCUREMENT_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  fmtQty,
} from '../lib/constants'

const ANY = 'any'
const PAGE_SIZE_KEY = 'mfg-products-page-size'
const PAGE_SIZES = [10, 20, 50, 100, 200, 500, ALL_ROWS]
/** Batch tracking is switched per product on the server — sent in slices this size. */
const TRACKING_CHUNK = 500

const savedPageSize = () => {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return PAGE_SIZES.includes(n) ? n : 20
  } catch {
    return 20
  }
}

/** Whole calendar days from today to `date` (negative = expired). */
const daysFromToday = (date: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((new Date(date).getTime() - today.getTime()) / 86400000)
}

const batchCountLabel = (n: number, t: (s: string) => string) =>
  n === 0
    ? t('No batches')
    : n === 1
      ? t('1 batch')
      : t('{{n}} batches').replace('{{n}}', String(n))
type Sort = 'name' | 'newest' | 'stock' | 'stockLow' | 'cost'

/**
 * The details page for a product, opened on its Manufacturing tab. From the module the
 * page leads with manufacturing and links back here; from the catalog's own Products
 * page (`embedded`) it is the ordinary details page, so its breadcrumb returns there.
 */
const detailsLink = (p: { id: string }, embedded = false) => ({
  to: '/products/$productId' as const,
  params: { productId: p.id },
  search: (embedded
    ? { tab: 'manufacturing' }
    : { tab: 'manufacturing', from: 'manufacturing' }) as never,
})

/**
 * Manufacturing → Products: the shared product catalog seen through manufacturing —
 * laid out like the catalog's own Products List (actions, totals, filters, table), with
 * the type, BOM and procurement on top. Adding a product uses the catalog's Add Product
 * dialog, pre-set to the type being viewed; a row opens the product's details page on its
 * Manufacturing tab.
 *
 * `embedded` renders it as the Manufacturing view of the catalog's Products page (for
 * businesses with the module): that page supplies the title and Add Product, so only an
 * "Add {type}" shortcut for the type chip being viewed is shown here.
 */
export default function ManufacturingProducts({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const { hasAnyPermission, hasPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBoms', 'editProducts')
  const canCreate = hasPermission('createProducts')
  // Category / brand writes go through the catalog's own endpoints (editProducts).
  const canEditCatalog = hasPermission('editProducts')
  const canDelete = hasPermission('deleteProducts')
  // Rows can be ticked by anyone who has at least one bulk action.
  const canSelect = canEdit || canDelete
  const routeSearch = useSearch({ strict: false }) as { type?: string }

  const [typeFilter, setTypeFilter] = useState<string>(
    routeSearch.type || 'all'
  )
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [procurement, setProcurement] = useState<string>(ANY)
  const [bom, setBom] = useState<string>(ANY)
  const [stock, setStock] = useState<string>(ANY)
  const [tracking, setTracking] = useState<string>(ANY)
  const [category, setCategory] = useState<string>(ANY)
  const [brand, setBrand] = useState<string>(ANY)
  const [batchesOf, setBatchesOf] = useState<ManufacturingProduct | null>(
    null
  )
  const [packSizesOf, setPackSizesOf] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('name')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(savedPageSize)
  /** Selected products, id → name (names feed the bulk dialogs' previews). */
  const [selection, setSelection] = useState<Map<string, string>>(new Map())
  const [bulkDialog, setBulkDialog] = useState<
    'type' | 'category' | 'brand' | 'delete' | null
  >(null)
  const [deleting, setDeleting] = useState<ManufacturingProduct | null>(null)
  const [attributes, setAttributes] = useState<ManufacturingProduct | null>(
    null
  )
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (routeSearch.type) setTypeFilter(routeSearch.type)
  }, [routeSearch.type])

  const filters: ManufacturingProductFilters = {
    search: debounced || undefined,
    productType: typeFilter === 'all' ? undefined : typeFilter,
    procurementType:
      procurement === ANY
        ? undefined
        : (procurement as ProcurementType | 'none'),
    hasBom: bom === ANY ? undefined : bom === 'yes',
    stock: stock === ANY ? undefined : (stock as 'in' | 'out'),
    tracking: tracking === ANY ? undefined : (tracking as 'batch' | 'none'),
    categoryId: category === ANY ? undefined : category,
    brandId: brand === ANY ? undefined : brand,
  }
  const categories = useSelector((state: RootState) => state.category.categories)
  const { data: brands = [] } = useGetAllBrandsQuery()
  useEffect(() => {
    dispatch(fetchCategories({ page: 1, limit: 100 }))
  }, [dispatch])
  const { data: summary } = useGetProductTypeSummaryQuery()
  const { data: stats, isFetching: statsLoading } =
    useGetManufacturingProductStatsQuery(filters)
  const { data, isFetching, isLoading } = useGetManufacturingProductsQuery({
    ...filters,
    sort,
    page,
    limit,
  })
  const [fetchMatching, { isFetching: matchingBusy }] =
    useLazyGetMatchingManufacturingProductIdsQuery()
  const [bulkTracking, { isLoading: trackingBusy }] =
    useBulkProductTrackingMutation()
  const { data: productForEdit } = useGetProductQuery(editingId as string, {
    skip: !editingId,
  })

  const rows = data?.results || []
  const selected = useMemo(() => [...selection.keys()], [selection])
  const selectedTargets = useMemo(
    () => [...selection].map(([id, name]) => ({ id, name })),
    [selection]
  )
  const isSelected = (id: string) => selection.has(id)
  const allOnPage = rows.length > 0 && rows.every((r) => selection.has(r.id))
  const someOnPage = rows.some((r) => selection.has(r.id))
  const matchingTotal = data?.totalResults ?? 0
  const allMatchingSelected =
    matchingTotal > 0 && selection.size >= matchingTotal
  const total = summary ? Object.values(summary).reduce((s, n) => s + n, 0) : 0
  const filtered =
    !!debounced ||
    procurement !== ANY ||
    bom !== ANY ||
    stock !== ANY ||
    tracking !== ANY ||
    category !== ANY ||
    brand !== ANY
  const clearSelection = () => setSelection(new Map())
  const resetPage = () => {
    setPage(1)
    clearSelection()
  }
  const clearFilters = () => {
    setSearch('')
    setProcurement(ANY)
    setBom(ANY)
    setStock(ANY)
    setTracking(ANY)
    setCategory(ANY)
    setBrand(ANY)
    resetPage()
  }
  const changeLimit = (n: number) => {
    setLimit(n)
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(n))
    } catch {
      /* per-viewer convenience only */
    }
  }

  /** What a new product starts as: the type being viewed, else a finished good. */
  const newProductType: ProductType | null = useMemo(
    () =>
      (PRODUCT_TYPES as string[]).includes(typeFilter)
        ? (typeFilter as ProductType)
        : typeFilter === 'unclassified'
          ? null
          : 'finished_good',
    [typeFilter]
  )

  const refreshAfterSave = () => {
    dispatch(
      manufacturingApi.util.invalidateTags(['MfgProduct', 'MfgDashboard'])
    )
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
  }

  /** Every product the current filter matches — not just this page. */
  const selectAllMatching = async () => {
    try {
      const res = await fetchMatching({ ...filters, sort }).unwrap()
      setSelection(new Map(res.results.map((r) => [r.id, r.name])))
      if (res.total > res.results.length)
        toast.warning(
          t('Only the first {{n}} products were selected — narrow the filter to reach the rest.').replace(
            '{{n}}',
            res.results.length.toLocaleString()
          )
        )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to select products')))
    }
  }

  const afterBulk = () => {
    refreshAfterSave()
    clearSelection()
  }

  /** Batch tracking on / off for the selected products (each on its own). */
  const applyTracking = async (flags: {
    trackBatch: boolean
    trackExpiry?: boolean
  }) => {
    if (!selected.length) return
    try {
      let updated = 0
      const failed: { name: string; message: string }[] = []
      for (let i = 0; i < selected.length; i += TRACKING_CHUNK) {
        const res = await bulkTracking({
          productIds: selected.slice(i, i + TRACKING_CHUNK),
          ...flags,
        }).unwrap()
        updated += res.updated
        failed.push(...res.failed)
      }
      if (updated)
        toast.success(
          t('Batch tracking updated for {{count}} product(s)').replace(
            '{{count}}',
            String(updated)
          )
        )
      failed.slice(0, 5).forEach((f) => toast.error(`${f.name}: ${f.message}`))
      if (failed.length > 5)
        toast.error(
          t('{{n}} more product(s) could not be changed').replace(
            '{{n}}',
            String(failed.length - 5)
          )
        )
      if (!failed.length) clearSelection()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to update batch tracking')))
    }
  }

  const toggle = (p: ManufacturingProduct, on: boolean) =>
    setSelection((cur) => {
      const next = new Map(cur)
      if (on) next.set(p.id, p.name)
      else next.delete(p.id)
      return next
    })
  const togglePage = (on: boolean) =>
    setSelection((cur) => {
      const next = new Map(cur)
      rows.forEach((r) => (on ? next.set(r.id, r.name) : next.delete(r.id)))
      return next
    })

  const chips: ChipOption[] = [
    { value: 'all', label: t('All'), count: total },
    ...PRODUCT_TYPES.filter((type) => (summary?.[type] ?? 1) > 0).map(
      (type) => ({
        value: type,
        label: t(PRODUCT_TYPE_META[type].label),
        count: summary?.[type],
      })
    ),
    {
      value: 'unclassified',
      label: t('Unclassified'),
      count: summary?.unclassified,
      tone: 'warning',
    },
  ]

  const columns: Column<ManufacturingProduct>[] = [
    ...(canSelect
      ? [
          {
            id: 'select',
            className: 'w-10',
            header: (
              <Checkbox
                checked={
                  allOnPage ? true : someOnPage ? 'indeterminate' : false
                }
                onCheckedChange={(v) => togglePage(!!v)}
                aria-label={t('Select all on this page')}
              />
            ),
            cell: (p: ManufacturingProduct) => (
              <Checkbox
                checked={isSelected(p.id)}
                onCheckedChange={(v) => toggle(p, !!v)}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('Select {{name}}').replace('{{name}}', p.name)}
              />
            ),
          } satisfies Column<ManufacturingProduct>,
        ]
      : []),
    {
      id: 'product',
      header: t('Product Name'),
      cell: (p) => (
        <div className='flex min-w-0 items-center gap-2.5'>
          <span onClick={(e) => e.stopPropagation()} className='shrink-0'>
            <ImageGalleryViewer
              images={[]}
              fallbackUrl={p.image?.url}
              name={p.name}
              size='sm'
              className='rounded-full'
            />
          </span>
          <div className='min-w-0'>
            <Link
              {...detailsLink(p, embedded)}
              onClick={(e) => e.stopPropagation()}
              className='hover:text-primary block truncate font-medium hover:underline'
            >
              {p.name}
            </Link>
            <div className='text-muted-foreground truncate text-xs'>
              {p.sku || p.barcode || '—'}
              {p.packOf && (
                <span
                  className='ml-2 text-sky-700 dark:text-sky-300'
                  title={`${t('Made by packing')} ${p.packOf.productName}`}
                >
                  · {t('Pack of')} {p.packOf.productName} ({fmtQty(p.packOf.contentQuantity)}{' '}
                  {p.packOf.contentUnit})
                </span>
              )}
              {!!p.packSizeCount && (
                <button
                  type='button'
                  className='ml-2 text-violet-700 hover:underline dark:text-violet-300'
                  onClick={(e) => {
                    e.stopPropagation()
                    setPackSizesOf(p.id)
                  }}
                >
                  · {p.packSizeCount} {t('pack sizes')}
                </button>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (p) => (
        <div className='flex flex-col items-start gap-1'>
          <ProductTypeBadge type={p.productType} />
          {p.issueMethod === 'floor' && <ProductionStockTag />}
        </div>
      ),
    },
    {
      id: 'categories',
      header: t('Categories'),
      hideBelow: 'xl',
      cell: (p) =>
        p.categories?.length ? (
          <div className='flex flex-wrap gap-1'>
            {p.categories.slice(0, 2).map((c) => (
              <Badge key={c._id} variant='outline' className='font-normal'>
                {c.name}
              </Badge>
            ))}
            {p.categories.length > 2 && (
              <span className='text-muted-foreground text-xs'>
                +{p.categories.length - 2}
              </span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground'>-</span>
        ),
    },
    {
      id: 'brand',
      header: t('Brand'),
      hideBelow: 'xl',
      cell: (p) =>
        p.brand ? (
          <span className='inline-flex max-w-36 items-center gap-1 truncate text-sm'>
            <Award className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
            <span className='truncate'>{p.brand.name}</span>
          </span>
        ) : (
          <span className='text-muted-foreground'>-</span>
        ),
    },
    {
      id: 'cost',
      header: t('Purchase'),
      money: true,
      align: 'right',
      hideBelow: 'md',
      cell: (p) => <span className='tabular-nums'>{formatMoney(p.cost)}</span>,
    },
    {
      id: 'price',
      header: t('Sale Price'),
      money: true,
      align: 'right',
      hideBelow: 'lg',
      cell: (p) => <span className='tabular-nums'>{formatMoney(p.price)}</span>,
    },
    {
      id: 'stock',
      header: t('Stock Quantity'),
      align: 'right',
      cell: (p) => (
        <Badge
          variant='outline'
          className={cn(
            'capitalize tabular-nums',
            p.stockQuantity <= 0 &&
              'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          )}
        >
          {fmtQty(p.stockQuantity)} {getUnitLabel(p.unit)}
        </Badge>
      ),
    },
    {
      id: 'batches',
      header: t('Batches'),
      hideBelow: 'md',
      cell: (p) => {
        const tr = p.tracking
        if (!tr?.trackBatch && !tr?.trackExpiry)
          return <span className='text-muted-foreground'>—</span>
        const days = tr.nearestExpiry ? daysFromToday(tr.nearestExpiry) : null
        return (
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              setBatchesOf(p)
            }}
            className='group text-left'
            title={t('Show batches')}
          >
            <BatchBadge
              size='sm'
              tone={tr.expiredQuantity > 0 ? 'danger' : tr.batchCount ? 'default' : 'muted'}
              mono={false}
              batchNumber={batchCountLabel(tr.batchCount, t)}
              className='group-hover:underline'
            />
            {days !== null && (
              <div
                className={cn(
                  'mt-0.5 text-[11px] tabular-nums',
                  days < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : days <= 30
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                )}
              >
                {days < 0 ? t('Expired stock') : `${t('exp')} ${t('{{n}}d').replace('{{n}}', String(days))}`}
              </div>
            )}
            {(tr.unbatchedQuantity || 0) > 0 && (
              <div className='mt-0.5 text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-400'>
                {fmtQty(tr.unbatchedQuantity || 0)} {t('without batch')}
              </div>
            )}
          </button>
        )
      },
    },
    {
      id: 'bom',
      header: t('BOM'),
      hideBelow: 'lg',
      cell: (p) =>
        p.bomCount > 0 ? (
          <Link
            to={'/manufacturing/boms' as never}
            search={{ productId: p.id } as never}
            onClick={(e) => e.stopPropagation()}
            className='inline-flex items-center gap-1 text-sm hover:underline'
          >
            <FileStack className='text-muted-foreground h-3.5 w-3.5' />
            {t('{{count}} version(s)').replace('{{count}}', String(p.bomCount))}
          </Link>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      id: 'procurement',
      header: t('Procurement'),
      hideBelow: 'xl',
      cell: (p) => (
        <span className='text-muted-foreground'>
          {p.procurementType ? t(PROCUREMENT_LABELS[p.procurementType]) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className='sr-only'>{t('Actions')}</span>,
      className: 'w-12',
      align: 'right',
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={(e) => e.stopPropagation()}
              aria-label={t('Actions for {{name}}').replace('{{name}}', p.name)}
            >
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='w-56'
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem asChild>
              <Link {...detailsLink(p, embedded)}>
                <Eye className='mr-2 h-4 w-4' />
                {t('View details')}
              </Link>
            </DropdownMenuItem>
            {hasPermission('editProducts') && (
              <DropdownMenuItem onClick={() => setEditingId(p.id)}>
                <Pencil className='mr-2 h-4 w-4' />
                {t('Edit product')}
              </DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem onClick={() => setAttributes(p)}>
                <Settings2 className='mr-2 h-4 w-4' />
                {t('Manufacturing settings')}
              </DropdownMenuItem>
            )}
            {(!p.productType || p.productType === 'finished_good' || p.productType === 'by_product') && (
              <DropdownMenuItem onClick={() => setPackSizesOf(p.id)}>
                <Boxes className='mr-2 h-4 w-4' />
                {t('Pack sizes')}
              </DropdownMenuItem>
            )}
            {(p.tracking?.trackBatch || p.tracking?.trackExpiry) && (
              <DropdownMenuItem onClick={() => setBatchesOf(p)}>
                <Layers className='mr-2 h-4 w-4' />
                {t('Batches')}
              </DropdownMenuItem>
            )}
            {hasPermission('manageBoms') && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to={'/manufacturing/boms' as never}
                    search={{ productId: p.id, new: true } as never}
                  >
                    <FileStack className='mr-2 h-4 w-4' />
                    {p.bomCount ? t('New BOM version') : t('Create BOM')}
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setDeleting(p)}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete product')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className='space-y-4'>
      {/* Header — same shape as the catalog's Products List */}
      {!embedded && (
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-2xl font-bold tracking-tight'>{t('Products')}</h2>
          <p className='text-muted-foreground'>
            {t(
              'Your catalog for production — raw materials, components, packaging and finished goods.'
            )}
          </p>
        </div>
        <div className='flex gap-2 max-sm:w-full max-sm:flex-wrap'>
          <Button asChild variant='outline' className='gap-1.5 max-sm:flex-1'>
            <Link to='/products'>
              <ExternalLink className='h-4 w-4' />
              {t('Full catalog')}
            </Link>
          </Button>
          {canCreate && (
            <Button
              className='gap-1.5 max-sm:basis-full'
              onClick={() => setAdding(true)}
            >
              <PlusCircle className='h-4 w-4' />
              {(PRODUCT_TYPES as string[]).includes(typeFilter)
                ? t('Add {{type}}').replace(
                    '{{type}}',
                    t(PRODUCT_TYPE_META[typeFilter as ProductType].label)
                  )
                : t('Add Product')}
            </Button>
          )}
        </div>
      </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <FilterChips
          className='min-w-0 flex-1'
          label={t('Filter by product type')}
          options={chips}
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v)
            resetPage()
          }}
        />
        {embedded &&
          canCreate &&
          (PRODUCT_TYPES as string[]).includes(typeFilter) && (
            <Button
              size='sm'
              variant='outline'
              className='h-8 gap-1.5 max-sm:w-full'
              onClick={() => setAdding(true)}
            >
              <PlusCircle className='h-4 w-4' />
              {t('Add {{type}}').replace(
                '{{type}}',
                t(PRODUCT_TYPE_META[typeFilter as ProductType].label)
              )}
            </Button>
          )}
      </div>

      <div className='grid grid-cols-2 gap-2 sm:flex sm:flex-wrap'>
        <ProductSummaryChip
          icon={Package}
          label={t('Total Products')}
          value={
            statsLoading && !stats
              ? '…'
              : (stats?.products ?? 0).toLocaleString()
          }
        />
        <ProductSummaryChip
          icon={Boxes}
          label={t('Total Stock Quantity')}
          value={
            statsLoading && !stats
              ? '…'
              : (stats?.stockQuantity ?? 0).toLocaleString()
          }
        />
        {canSeeCosts && (
          <>
            <ProductSummaryChip
              icon={Wallet}
              label={t('Total Value of Stock')}
              value={
                statsLoading && !stats ? '…' : formatMoney(stats?.stockValue ?? 0)
              }
            />
            <ProductSummaryChip
              icon={CircleDollarSign}
              label={t('Avg Purchase Price')}
              value={
                statsLoading && !stats ? '…' : formatMoney(stats?.avgCost ?? 0)
              }
            />
          </>
        )}
        <ProductSummaryChip
          icon={FileStack}
          label={t('With BOM')}
          value={statsLoading && !stats ? '…' : `${stats?.withBom ?? 0}`}
        />
      </div>

      {/* Toolbar: search + filters + sort */}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-0 flex-1 basis-64'>
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v)
              resetPage()
            }}
            placeholder={t('Search name, SKU or barcode')}
          />
        </div>
        <div className='grid grid-cols-2 gap-2 max-sm:w-full sm:flex sm:flex-wrap'>
          <FilterSelect
            label={t('Procurement')}
            value={procurement}
            onChange={(v) => {
              setProcurement(v)
              resetPage()
            }}
            options={[
              [ANY, t('Any procurement')],
              ...(Object.keys(PROCUREMENT_LABELS) as ProcurementType[]).map(
                (p) => [p, t(PROCUREMENT_LABELS[p])] as [string, string]
              ),
              ['none', t('Not set')],
            ]}
          />
          <FilterSelect
            label={t('BOM')}
            value={bom}
            onChange={(v) => {
              setBom(v)
              resetPage()
            }}
            options={[
              [ANY, t('Any BOM')],
              ['yes', t('Has a BOM')],
              ['no', t('No BOM')],
            ]}
          />
          <FilterSelect
            label={t('Stock')}
            value={stock}
            onChange={(v) => {
              setStock(v)
              resetPage()
            }}
            options={[
              [ANY, t('All stock')],
              ['in', t('In stock')],
              ['out', t('Out of stock')],
            ]}
          />
          <FilterSelect
            label={t('Batch tracking')}
            value={tracking}
            onChange={(v) => {
              setTracking(v)
              resetPage()
            }}
            options={[
              [ANY, t('Any tracking')],
              ['batch', t('Batch tracked')],
              ['none', t('Not batch tracked')],
            ]}
          />
          <SearchFilterSelect
            label={t('Category')}
            anyLabel={t('Any category')}
            noneLabel={t('No category')}
            value={category}
            onChange={(v) => {
              setCategory(v)
              resetPage()
            }}
            options={categories
              .filter((c) => c.isActive !== false || c.id === category)
              .map((c) => ({ value: c.id, label: c.name }))}
          />
          <SearchFilterSelect
            label={t('Brand')}
            anyLabel={t('Any brand')}
            noneLabel={t('No brand')}
            value={brand}
            onChange={(v) => {
              setBrand(v)
              resetPage()
            }}
            options={brands.map((b) => ({
              value: (b._id || b.id) as string,
              label: b.name,
            }))}
          />
          <FilterSelect
            label={t('Sort')}
            value={sort}
            onChange={(v) => {
              setSort(v as Sort)
              resetPage()
            }}
            options={[
              ['name', t('Name A–Z')],
              ['newest', t('Newest first')],
              ['stock', t('Most stock')],
              ['stockLow', t('Least stock')],
              ['cost', t('Highest cost')],
            ]}
          />
          {filtered && (
            <Button
              variant='ghost'
              size='sm'
              className='h-9 gap-1 max-sm:col-span-2'
              onClick={clearFilters}
            >
              <X className='h-3.5 w-3.5' />
              {t('Clear filters')}
            </Button>
          )}
        </div>
      </div>

      {/* Selection bar: what's selected, select-all-matching, and the bulk actions */}
      {canSelect && selection.size > 0 && (
        <div
          className='bg-primary/5 border-primary/20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2'
          role='region'
          aria-label={t('Bulk actions')}
        >
          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            <span className='bg-primary text-primary-foreground inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums'>
              {selection.size.toLocaleString()}
            </span>
            <span className='font-medium'>
              {allMatchingSelected
                ? t('All {{count}} matching products selected').replace(
                    '{{count}}',
                    matchingTotal.toLocaleString()
                  )
                : t('selected')}
            </span>
            {!allMatchingSelected && allOnPage && matchingTotal > rows.length && (
              <Button
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={selectAllMatching}
                disabled={matchingBusy}
              >
                {matchingBusy && <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' />}
                {t('Select all {{count}} matching').replace(
                  '{{count}}',
                  matchingTotal.toLocaleString()
                )}
              </Button>
            )}
          </div>
          <div className='ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-2'>
            {canEdit && (
              <Button
                size='sm'
                variant='outline'
                className='bg-background h-9 gap-1.5'
                onClick={() => setBulkDialog('type')}
              >
                <Shapes className='h-3.5 w-3.5' />
                {t('Set type')}
              </Button>
            )}
            {canEditCatalog && (
              <>
                <Button
                  size='sm'
                  variant='outline'
                  className='bg-background h-9 gap-1.5'
                  onClick={() => setBulkDialog('category')}
                >
                  <Tags className='h-3.5 w-3.5' />
                  {t('Set category')}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  className='bg-background h-9 gap-1.5'
                  onClick={() => setBulkDialog('brand')}
                >
                  <Award className='h-3.5 w-3.5' />
                  {t('Set brand')}
                </Button>
              </>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size='sm'
                    variant='outline'
                    className='bg-background h-9 gap-1.5'
                    disabled={trackingBusy}
                  >
                    {trackingBusy ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Layers className='h-3.5 w-3.5' />
                    )}
                    {t('Batch tracking')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-56'>
                  <DropdownMenuItem
                    onClick={() => applyTracking({ trackBatch: true })}
                  >
                    {t('Track batches')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      applyTracking({ trackBatch: true, trackExpiry: true })
                    }
                  >
                    {t('Track batches + expiry')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      applyTracking({ trackBatch: false, trackExpiry: false })
                    }
                  >
                    {t('Turn tracking off')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canDelete && (
              <Button
                size='sm'
                variant='outline'
                className='bg-background text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10 h-9 gap-1.5'
                onClick={() => setBulkDialog('delete')}
              >
                <Trash2 className='h-3.5 w-3.5' />
                {t('Delete')}
              </Button>
            )}
            <Button
              size='sm'
              variant='ghost'
              className='h-9 gap-1'
              onClick={clearSelection}
            >
              <X className='h-3.5 w-3.5' />
              {t('Clear selection')}
            </Button>
          </div>
        </div>
      )}

      <DataTable
        caption={t('Products')}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={(p) => navigate(detailsLink(p, embedded))}
        rowClassName={(p) => isSelected(p.id) && 'bg-muted/40'}
        empty={
          <EmptyState
            bordered={false}
            icon={Boxes}
            title={
              filtered || typeFilter !== 'all'
                ? t('No products match')
                : t('No products yet')
            }
            description={
              filtered || typeFilter !== 'all'
                ? t('Try another type, filter or search term.')
                : t('Add a product, or classify items from your catalog.')
            }
            action={
              canCreate ? (
                <Button size='sm' onClick={() => setAdding(true)}>
                  <PlusCircle className='mr-1.5 h-4 w-4' />
                  {t('Add Product')}
                </Button>
              ) : undefined
            }
          />
        }
        mobileCard={(p) => (
          <div className='flex items-start gap-3'>
            <ImageGalleryViewer
              images={[]}
              fallbackUrl={p.image?.url}
              name={p.name}
              size='sm'
              className='rounded-full'
            />
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex items-start justify-between gap-2'>
                <div className='truncate font-medium'>{p.name}</div>
                <ProductTypeBadge type={p.productType} />
              </div>
              <div className='text-muted-foreground flex flex-wrap gap-x-2 text-xs'>
                <span>{p.sku || '—'}</span>
                <span>
                  {fmtQty(p.stockQuantity)} {getUnitLabel(p.unit)}
                </span>
                {canSeeCosts && <span>{formatMoney(p.cost)}</span>}
                {p.tracking?.trackBatch && (
                  <span className='text-blue-700 dark:text-blue-300'>
                    {batchCountLabel(p.tracking.batchCount, t)}
                  </span>
                )}
                {p.bomCount > 0 && (
                  <span>
                    {t('{{count}} BOM').replace(
                      '{{count}}',
                      String(p.bomCount)
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        footer={
          data && data.totalResults > 0 ? (
            <Pager
              data={data}
              page={page}
              onPageChange={setPage}
              onLimitChange={changeLimit}
              pageSizeOptions={PAGE_SIZES}
              itemLabel={t('products')}
            />
          ) : undefined
        }
      />

      {bulkDialog === 'type' && (
        <BulkTypeDialog
          productIds={selected}
          onClose={() => setBulkDialog(null)}
          onApplied={afterBulk}
        />
      )}
      <BulkCategoryDialog
        open={bulkDialog === 'category'}
        onOpenChange={(o) => !o && setBulkDialog(null)}
        products={selectedTargets}
        onApplied={afterBulk}
      />
      <BulkBrandDialog
        open={bulkDialog === 'brand'}
        onOpenChange={(o) => !o && setBulkDialog(null)}
        products={selectedTargets}
        onApplied={afterBulk}
      />
      <BulkDeleteDialog
        open={bulkDialog === 'delete'}
        onOpenChange={(o) => !o && setBulkDialog(null)}
        products={selectedTargets}
        onDeleted={afterBulk}
      />
      {deleting && (
        <UsersDeleteDialog
          key={deleting.id}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          currentRow={{ id: deleting.id, name: deleting.name }}
          setFetch={() => {
            refreshAfterSave()
            setSelection((cur) => {
              if (!cur.has(deleting.id)) return cur
              const next = new Map(cur)
              next.delete(deleting.id)
              return next
            })
          }}
        />
      )}

      {packSizesOf && (
        <PackSizesSheet productId={packSizesOf} onClose={() => setPackSizesOf(null)} />
      )}

      {batchesOf && (
        <ProductBatchesSheet
          productId={batchesOf.id}
          productName={batchesOf.name}
          unit={batchesOf.unit}
          onClose={() => setBatchesOf(null)}
        />
      )}

      {attributes && (
        <ProductAttributesSheet
          product={attributes}
          onClose={() => setAttributes(null)}
        />
      )}

      {adding && (
        <UsersActionDialog
          key={`mfg-add-${newProductType}`}
          open={adding}
          onOpenChange={setAdding}
          defaultProductType={newProductType}
          setFetch={refreshAfterSave}
        />
      )}
      {editingId && productForEdit && (
        <UsersActionDialog
          key={`mfg-edit-${editingId}`}
          open
          onOpenChange={(o) => !o && setEditingId(null)}
          currentRow={productForEdit}
          setFetch={refreshAfterSave}
        />
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='h-9 min-w-36 max-sm:w-full' aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * A filter with a search box for long lists (categories, brands): "Any …", "No …", then
 * every option. Same height and look as FilterSelect so the toolbar lines up.
 */
function SearchFilterSelect({
  label,
  anyLabel,
  noneLabel,
  value,
  onChange,
  options,
}: {
  label: string
  anyLabel: string
  noneLabel: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const current =
    value === ANY
      ? anyLabel
      : value === 'none'
        ? noneLabel
        : options.find((o) => o.value === value)?.label || anyLabel
  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }
  const item = (v: string, text: string) => (
    <CommandItem key={v} value={`${text} ${v}`} onSelect={() => pick(v)}>
      <Check
        className={cn('mr-2 h-4 w-4', value === v ? 'opacity-100' : 'opacity-0')}
      />
      <span className='truncate'>{text}</span>
    </CommandItem>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          aria-label={label}
          className={cn(
            'h-9 min-w-36 justify-between px-3 font-normal max-sm:w-full',
            value !== ANY && 'border-primary/40 bg-primary/5'
          )}
        >
          <span className='max-w-40 truncate'>{current}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-64 p-0' align='start'>
        <Command>
          <CommandInput placeholder={`${t('Search')} ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>{t('Nothing found')}</CommandEmpty>
            <CommandGroup>
              {item(ANY, anyLabel)}
              {item('none', noneLabel)}
            </CommandGroup>
            {options.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {options.map((o) => item(o.value, o.label))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Kept in production stock: issued to the floor in bulk, used automatically. */
function ProductionStockTag() {
  const { t } = useLanguage()
  return (
    <Link
      to={'/manufacturing/production-stock' as never}
      onClick={(e) => e.stopPropagation()}
      title={t('Issued to production in bulk and used automatically — see Production Stock')}
      className='rounded border border-teal-500/25 bg-teal-500/10 px-1.5 text-[10px] font-medium text-teal-700 hover:underline dark:text-teal-300'
    >
      {t('Production stock')}
    </Link>
  )
}
