import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Boxes,
  CircleDollarSign,
  ExternalLink,
  Eye,
  FileStack,
  MoreHorizontal,
  Package,
  Pencil,
  PlusCircle,
  Settings2,
  Tags,
  Wallet,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  manufacturingApi,
  useBulkClassifyProductsMutation,
  useGetManufacturingProductStatsQuery,
  useGetManufacturingProductsQuery,
  useGetProductTypeSummaryQuery,
  type ManufacturingProduct,
  type ManufacturingProductFilters,
  type ProcurementType,
  type ProductType,
} from '@/stores/manufacturing.api'
import { useGetProductQuery } from '@/stores/product.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import type { AppDispatch } from '@/stores/store'
import { useFormatMoney } from '@/lib/format-money'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImageGalleryViewer } from '@/components/image-gallery-viewer'
import { ProductSummaryChip } from '@/features/products/components/product-summary-chip'
import { UsersActionDialog } from '@/features/products/components/users-action-dialog'
import { ProductTypeBadge } from '../components/badges'
import { DataTable, type Column } from '../components/data-table'
import {
  FilterChips,
  SearchField,
  type ChipOption,
} from '../components/list-controls'
import { EmptyState } from '../components/page'
import { Pager } from '../components/pager'
import { ProductAttributesSheet } from '../components/product-attributes-sheet'
import {
  PROCUREMENT_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  fmtQty,
} from '../lib/constants'

const NONE = '__none__'
const ANY = 'any'
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
  const { hasAnyPermission, hasPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBoms', 'editProducts')
  const canCreate = hasPermission('createProducts')
  const routeSearch = useSearch({ strict: false }) as { type?: string }

  const [typeFilter, setTypeFilter] = useState<string>(
    routeSearch.type || 'all'
  )
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [procurement, setProcurement] = useState<string>(ANY)
  const [bom, setBom] = useState<string>(ANY)
  const [stock, setStock] = useState<string>(ANY)
  const [sort, setSort] = useState<Sort>('name')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkType, setBulkType] = useState<string>('')
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
  }
  const { data: summary } = useGetProductTypeSummaryQuery()
  const { data: stats, isFetching: statsLoading } =
    useGetManufacturingProductStatsQuery(filters)
  const { data, isFetching, isLoading } = useGetManufacturingProductsQuery({
    ...filters,
    sort,
    page,
    limit: 20,
  })
  const [bulkClassify, { isLoading: bulkBusy }] =
    useBulkClassifyProductsMutation()
  const { data: productForEdit } = useGetProductQuery(editingId as string, {
    skip: !editingId,
  })

  const rows = data?.results || []
  const allOnPage =
    rows.length > 0 && rows.every((r) => selected.includes(r.id))
  const someOnPage = rows.some((r) => selected.includes(r.id))
  const total = summary ? Object.values(summary).reduce((s, n) => s + n, 0) : 0
  const filtered =
    !!debounced || procurement !== ANY || bom !== ANY || stock !== ANY
  const resetPage = () => {
    setPage(1)
    setSelected([])
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

  const applyBulk = async () => {
    if (!bulkType || !selected.length) return
    try {
      const res = await bulkClassify({
        productIds: selected,
        productType: bulkType === NONE ? null : (bulkType as ProductType),
      }).unwrap()
      toast.success(
        t('{{count}} product(s) updated').replace(
          '{{count}}',
          String(res.modified)
        )
      )
      setSelected([])
      setBulkType('')
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to classify products')))
    }
  }

  const toggle = (id: string, on: boolean) =>
    setSelected(on ? [...selected, id] : selected.filter((x) => x !== id))

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
    ...(canEdit
      ? [
          {
            id: 'select',
            className: 'w-10',
            header: (
              <Checkbox
                checked={
                  allOnPage ? true : someOnPage ? 'indeterminate' : false
                }
                onCheckedChange={(v) =>
                  setSelected(
                    v
                      ? [...new Set([...selected, ...rows.map((r) => r.id)])]
                      : selected.filter((id) => !rows.some((r) => r.id === id))
                  )
                }
                aria-label={t('Select all on this page')}
              />
            ),
            cell: (p: ManufacturingProduct) => (
              <Checkbox
                checked={selected.includes(p.id)}
                onCheckedChange={(v) => toggle(p.id, !!v)}
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
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (p) => <ProductTypeBadge type={p.productType} />,
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
      id: 'cost',
      header: t('Purchase'),
      align: 'right',
      hideBelow: 'md',
      cell: (p) => <span className='tabular-nums'>{formatMoney(p.cost)}</span>,
    },
    {
      id: 'price',
      header: t('Sale Price'),
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
        <ProductSummaryChip
          icon={FileStack}
          label={t('With BOM')}
          value={statsLoading && !stats ? '…' : `${stats?.withBom ?? 0}`}
        />
      </div>

      {/* Toolbar: search + filters + sort, or the bulk bar while rows are selected */}
      {canEdit && selected.length > 0 ? (
        <div
          className='bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2'
          role='region'
          aria-label={t('Bulk actions')}
        >
          <span className='text-sm font-medium'>
            {t('{{count}} selected').replace(
              '{{count}}',
              String(selected.length)
            )}
          </span>
          <div className='ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full'>
            <Select value={bulkType} onValueChange={setBulkType}>
              <SelectTrigger
                className='h-9 w-48 max-sm:flex-1'
                aria-label={t('Set type')}
              >
                <SelectValue placeholder={t('Set type…')} />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(PRODUCT_TYPE_META[type].label)}
                  </SelectItem>
                ))}
                <SelectItem value={NONE}>
                  {t('Clear classification')}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size='sm'
              className='h-9'
              onClick={applyBulk}
              disabled={!bulkType || bulkBusy}
            >
              <Tags className='mr-1.5 h-3.5 w-3.5' />
              {t('Apply')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              className='h-9'
              onClick={() => setSelected([])}
            >
              {t('Clear')}
            </Button>
          </div>
        </div>
      ) : (
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
        rowClassName={(p) => selected.includes(p.id) && 'bg-muted/40'}
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
                <span>{formatMoney(p.cost)}</span>
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
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

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
