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
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProductTypeBadge } from '../components/badges'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
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

  const chips: { key: string; label: string; count?: number }[] = [
    { key: 'all', label: t('All'), count: total },
    ...PRODUCT_TYPES.map((type) => ({
      key: type,
      label: t(PRODUCT_TYPE_META[type].label),
      count: summary?.[type],
    })),
    {
      key: 'unclassified',
      label: t('Unclassified'),
      count: summary?.unclassified,
    },
  ]

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Manufacturing products')}
        description={t(
          'Your existing product catalog, classified for production. No separate product list — changes here apply to the same products used in sales and purchasing.'
        )}
      />

      <div className='-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]'>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type='button'
            onClick={() => {
              setTypeFilter(chip.key)
              setPage(1)
              setSelected([])
            }}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
              typeFilter === chip.key
                ? 'border-foreground bg-foreground text-background'
                : 'hover:bg-muted'
            )}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span className='tabular-nums opacity-70'>{chip.count}</span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder={t('Search name, SKU or barcode…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-72 max-sm:w-full'
            />
            {canEdit && selected.length > 0 && (
              <div className='bg-muted/40 ml-auto flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1 max-sm:ml-0 max-sm:w-full'>
                <span className='text-muted-foreground text-xs'>
                  {t('{{count}} selected').replace(
                    '{{count}}',
                    String(selected.length)
                  )}
                </span>
                <Select value={bulkType} onValueChange={setBulkType}>
                  <SelectTrigger className='h-8 w-44'>
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
                  onClick={applyBulk}
                  disabled={!bulkType || bulkBusy}
                >
                  <Tags className='mr-1.5 h-3.5 w-3.5' />
                  {t('Apply')}
                </Button>
              </div>
            )}
          </div>

          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  {canEdit && (
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allOnPage}
                        onCheckedChange={(v) =>
                          setSelected(
                            v
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...rows.map((r) => r.id),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) => !rows.some((r) => r.id === id)
                                )
                          )
                        }
                        aria-label={t('Select page')}
                      />
                    </TableHead>
                  )}
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead>{t('Procurement')}</TableHead>
                  <TableHead className='text-right'>{t('On hand')}</TableHead>
                  <TableHead className='text-right'>{t('Cost')}</TableHead>
                  <TableHead>{t('BOM')}</TableHead>
                  <TableHead className='w-10' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className='h-6 w-full' />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={Boxes}
                        title={t('No products match')}
                        description={t('Try another type or search term.')}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((product) => (
                  <TableRow
                    key={product.id}
                    className={cn(isFetching && 'opacity-70')}
                  >
                    {canEdit && (
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(product.id)}
                          onCheckedChange={(v) =>
                            setSelected(
                              v
                                ? [...selected, product.id]
                                : selected.filter((id) => id !== product.id)
                            )
                          }
                          aria-label={product.name}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className='font-medium'>{product.name}</div>
                      <div className='text-muted-foreground text-xs'>
                        {product.sku || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ProductTypeBadge type={product.productType} />
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {product.procurementType
                        ? t(PROCUREMENT_LABELS[product.procurementType])
                        : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(product.stockQuantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {product.unit}
                      </span>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(product.cost)}
                    </TableCell>
                    <TableCell>
                      {product.bomCount > 0 ? (
                        <Link
                          to={'/manufacturing/boms' as never}
                          search={{ productId: product.id } as never}
                          className='text-primary inline-flex items-center gap-1 text-sm hover:underline'
                        >
                          <FileStack className='h-3.5 w-3.5' />
                          {t('{{count}} version(s)').replace(
                            '{{count}}',
                            String(product.bomCount)
                          )}
                        </Link>
                      ) : (
                        <span className='text-muted-foreground text-xs'>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => setEditing(product)}
                          aria-label={t('Edit manufacturing attributes')}
                        >
                          <Pencil className='h-3.5 w-3.5' />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager data={data} page={page} onPageChange={setPage} />
        </CardContent>
      </Card>

      {editing && (
        <ProductAttributesDialog
          product={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ProductAttributesDialog({
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            {t(
              'Manufacturing attributes — everything else about this product stays as it is.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
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
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={save} disabled={isLoading}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
