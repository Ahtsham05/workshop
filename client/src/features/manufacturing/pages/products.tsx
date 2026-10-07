import { useEffect, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { Boxes, FileStack, Pencil, Tags } from 'lucide-react'
import { toast } from 'sonner'
import {
  useBulkClassifyProductsMutation,
  useGetBomsQuery,
  useGetManufacturingProductsQuery,
  useGetProductTypeSummaryQuery,
  useUpdateManufacturingProductMutation,
  type ManufacturingProduct,
  type ProcurementType,
  type ProductType,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ProductTypeBadge } from '../components/badges'
import { CellStack, DataTable, type Column } from '../components/data-table'
import {
  FilterChips,
  SearchField,
  Toolbar,
  type ChipOption,
} from '../components/list-controls'
import { EmptyState, Field, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import {
  PROCUREMENT_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  fmtQty,
} from '../lib/constants'

const NONE = '__none__'

export default function ManufacturingProducts() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBoms', 'editProducts')
  const routeSearch = useSearch({ strict: false }) as { type?: string }

  const [typeFilter, setTypeFilter] = useState<string>(
    routeSearch.type || 'all'
  )
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<ManufacturingProduct | null>(null)
  const [bulkType, setBulkType] = useState<string>('')

  useEffect(() => {
    if (routeSearch.type) setTypeFilter(routeSearch.type)
  }, [routeSearch.type])

  const { data: summary } = useGetProductTypeSummaryQuery()
  const { data, isFetching, isLoading } = useGetManufacturingProductsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    productType: typeFilter === 'all' ? undefined : typeFilter,
  })
  const [bulkClassify, { isLoading: bulkBusy }] =
    useBulkClassifyProductsMutation()

  const rows = data?.results || []
  const allOnPage =
    rows.length > 0 && rows.every((r) => selected.includes(r.id))
  const someOnPage = rows.some((r) => selected.includes(r.id))
  const total = summary ? Object.values(summary).reduce((s, n) => s + n, 0) : 0

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
      header: t('Product'),
      cell: (p) => <CellStack primary={p.name} secondary={p.sku || '—'} />,
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (p) => <ProductTypeBadge type={p.productType} />,
    },
    {
      id: 'procurement',
      header: t('Procurement'),
      hideBelow: 'lg',
      cell: (p) => (
        <span className='text-muted-foreground'>
          {p.procurementType ? t(PROCUREMENT_LABELS[p.procurementType]) : '—'}
        </span>
      ),
    },
    {
      id: 'onhand',
      header: t('On hand'),
      align: 'right',
      cell: (p) => (
        <span className='tabular-nums'>
          {fmtQty(p.stockQuantity)}{' '}
          <span className='text-muted-foreground text-xs'>{p.unit}</span>
        </span>
      ),
    },
    {
      id: 'cost',
      header: t('Cost'),
      align: 'right',
      hideBelow: 'md',
      cell: (p) => <span className='tabular-nums'>{formatMoney(p.cost)}</span>,
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
    ...(canEdit
      ? [
          {
            id: 'edit',
            header: <span className='sr-only'>{t('Actions')}</span>,
            className: 'w-12',
            align: 'right',
            cell: (p: ManufacturingProduct) => (
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(p)
                }}
                aria-label={t(
                  'Edit manufacturing attributes of {{name}}'
                ).replace('{{name}}', p.name)}
              >
                <Pencil className='h-3.5 w-3.5' />
              </Button>
            ),
          } satisfies Column<ManufacturingProduct>,
        ]
      : []),
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Products')}
        description={t(
          'Your existing catalog, classified for production. Changes here apply to the same products used in sales and purchasing.'
        )}
      />

      <div className='space-y-3'>
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
          <Toolbar>
            <SearchField
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
              placeholder={t('Search name, SKU or barcode')}
            />
          </Toolbar>
        )}
        <FilterChips
          label={t('Filter by product type')}
          options={chips}
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v)
            setPage(1)
            setSelected([])
          }}
        />
      </div>

      <DataTable
        caption={t('Products')}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={canEdit ? (p) => setEditing(p) : undefined}
        rowClassName={(p) => selected.includes(p.id) && 'bg-muted/40'}
        empty={
          <EmptyState
            bordered={false}
            icon={Boxes}
            title={t('No products match')}
            description={t('Try another type or search term.')}
          />
        }
        mobileCard={(p) => (
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0 space-y-1'>
              <div className='truncate font-medium'>{p.name}</div>
              <div className='text-muted-foreground text-xs'>
                {p.sku || '—'} · {fmtQty(p.stockQuantity)} {p.unit}
              </div>
            </div>
            <ProductTypeBadge type={p.productType} />
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

      {editing && (
        <ProductAttributesSheet
          product={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ProductAttributesSheet({
  product,
  onClose,
}: {
  product: ManufacturingProduct
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [productType, setProductType] = useState<string>(
    product.productType || NONE
  )
  const [procurement, setProcurement] = useState<string>(
    product.procurementType || NONE
  )
  const [leadTime, setLeadTime] = useState<string>(
    product.manufacturingLeadTimeDays?.toString() ?? ''
  )
  const [defaultBomId, setDefaultBomId] = useState<string>(
    product.defaultBomId || NONE
  )
  const { data: boms } = useGetBomsQuery({
    productId: product.id,
    isActive: true,
    limit: 50,
  })
  const [update, { isLoading }] = useUpdateManufacturingProductMutation()

  const save = async () => {
    try {
      await update({
        productId: product.id,
        productType: productType === NONE ? null : (productType as ProductType),
        procurementType:
          procurement === NONE ? null : (procurement as ProcurementType),
        manufacturingLeadTimeDays: leadTime === '' ? null : Number(leadTime),
        ...(defaultBomId !== (product.defaultBomId || NONE)
          ? { defaultBomId: defaultBomId === NONE ? null : defaultBomId }
          : {}),
      }).unwrap()
      toast.success(t('Manufacturing attributes saved'))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to save')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-md'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            {t(
              'Manufacturing attributes. Everything else about this product stays as it is.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className='grid flex-1 content-start gap-5 overflow-y-auto px-5 py-5'>
          <dl className='bg-muted/40 grid grid-cols-3 gap-3 rounded-lg border px-3 py-2.5'>
            <Field label={t('SKU')}>{product.sku || '—'}</Field>
            <Field label={t('On hand')}>
              {fmtQty(product.stockQuantity)} {product.unit}
            </Field>
            <Field label={t('BOMs')}>{product.bomCount}</Field>
          </dl>
          <div className='grid gap-1.5'>
            <Label>{t('Product type')}</Label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('Not classified')}</SelectItem>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(PRODUCT_TYPE_META[type].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('Procurement')}</Label>
              <Select value={procurement} onValueChange={setProcurement}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(Object.keys(PROCUREMENT_LABELS) as ProcurementType[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {t(PROCUREMENT_LABELS[p])}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('Lead time (days)')}</Label>
              <Input
                type='number'
                min={0}
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Default BOM')}</Label>
            <Select
              value={defaultBomId}
              onValueChange={setDefaultBomId}
              disabled={!boms?.results.length}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('No active BOM')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('None')}</SelectItem>
                {boms?.results.map((bom) => (
                  <SelectItem key={bom.id} value={bom.id}>
                    {bom.bomNumber} · v{bom.version}{' '}
                    {bom.name ? `— ${bom.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter className='flex-row justify-end border-t px-5 py-3'>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={save} disabled={isLoading}>
            {t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
