import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { skipToken } from '@reduxjs/toolkit/query'
import {
  AlertTriangle,
  Ban,
  Boxes,
  Loader2,
  Package2,
  PackageCheck,
  Plus,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCancelPackingMutation,
  useGetPackableProductsQuery,
  useGetPackingSetupQuery,
  useGetPackingVouchersQuery,
  usePostPackingMutation,
  type PackingVoucher,
} from '@/stores/manufacturing.api'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { FilterChips, SearchField } from '../components/list-controls'
import { PackSizesSheet } from '../components/pack-sizes-sheet'
import { PackingGrid } from '../components/packing-grid'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtQty } from '../lib/constants'
import { packingSummary, type PackCounts } from '../lib/packing-math'
import { useFormatMoney } from '../lib/use-mfg-money'

/*
 * Packing — bulk finished goods into cartons and bags. Most packing happens on the
 * finished-goods receipt ("Pack now"); this page lists every packing voucher and packs
 * bulk already in stock (loose left over, or goods that went through QC).
 */

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
    new Date()
  )

export default function PackingPage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canPack = hasPermission('receiveFinishedGoods')
  const [status, setStatus] = useState<'all' | 'posted' | 'cancelled'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [newOpen, setNewOpen] = useState(false)
  const [viewing, setViewing] = useState<PackingVoucher | null>(null)
  const debounced = useDebouncedValue(search, 300)
  useEffect(() => setPage(1), [status, debounced])

  const { data, isLoading, isFetching } = useGetPackingVouchersQuery({
    status,
    search: debounced.trim() || undefined,
    page,
    limit: 25,
  })
  const vouchers = data?.results || []

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Packing')}
        description={t(
          'Bulk finished goods packed into cartons and bags — from which batch, into which packs, and the packing material used.'
        )}
        actions={
          canPack && (
            <Button size='sm' onClick={() => setNewOpen(true)}>
              <Plus className='h-4 w-4' />
              {t('New packing')}
            </Button>
          )
        }
      />

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <FilterChips
          label={t('Status')}
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          options={[
            { value: 'all', label: t('All') },
            { value: 'posted', label: t('Posted') },
            { value: 'cancelled', label: t('Cancelled') },
          ]}
        />
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('Search voucher, product, batch or order')}
        />
      </div>

      {isLoading ? (
        <Skeleton className='h-64 w-full rounded-xl' />
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={Package2}
          title={
            debounced || status !== 'all'
              ? t('No packing matches')
              : t('Nothing packed yet')
          }
          description={t(
            'Pack on the finished-goods receipt of an order ("Pack now"), or pack bulk already in stock with New packing. Pack sizes are set on the product (Products → ⋯ → Pack sizes).'
          )}
          action={
            canPack && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setNewOpen(true)}
              >
                <Plus className='h-4 w-4' />
                {t('New packing')}
              </Button>
            )
          }
        />
      ) : (
        <div
          className={cn(
            'bg-card overflow-x-auto rounded-xl border',
            isFetching && 'opacity-70'
          )}
        >
          <table className='w-full min-w-[760px] text-sm'>
            <thead className='bg-muted/50 text-muted-foreground text-xs'>
              <tr className='text-left'>
                <th className='px-3 py-2 font-medium'>{t('Date')}</th>
                <th className='px-3 py-2 font-medium'>{t('Voucher')}</th>
                <th className='px-3 py-2 font-medium'>{t('Product')}</th>
                <th className='px-3 py-2 font-medium'>{t('Batch / order')}</th>
                <th className='px-3 py-2 font-medium'>{t('Packed into')}</th>
                <th className='px-3 py-2 text-right font-medium'>
                  {t('Bulk used')}
                </th>
                <th className='px-3 py-2 text-right font-medium'>
                  {t('Loose')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {vouchers.map((v) => (
                <tr
                  key={v.id}
                  className={cn(
                    'hover:bg-muted/40 cursor-pointer',
                    v.status === 'cancelled' && 'text-muted-foreground'
                  )}
                  onClick={() => setViewing(v)}
                >
                  <td className='px-3 py-2 whitespace-nowrap'>
                    {formatAppDate(new Date(v.packingDate))}
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <span
                      className={cn(
                        'font-mono font-medium',
                        v.status === 'cancelled' && 'line-through'
                      )}
                    >
                      {v.voucherNumber}
                    </span>
                    {v.status === 'cancelled' && (
                      <Badge
                        variant='outline'
                        className='ml-2 border-rose-500/40 text-rose-600'
                      >
                        {t('Cancelled')}
                      </Badge>
                    )}
                    {v.source === 'receipt' && v.status === 'posted' && (
                      <span className='text-muted-foreground ml-2 text-xs'>
                        {t('on receipt')}
                      </span>
                    )}
                  </td>
                  <td className='px-3 py-2'>{v.productName}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <span className='font-mono text-xs'>
                      {v.batchNumber || '—'}
                    </span>
                    {v.orderNumber && (
                      <div className='text-muted-foreground text-xs'>
                        {v.orderNumber}
                      </div>
                    )}
                  </td>
                  <td className='px-3 py-2'>
                    {v.lines
                      .map((l) => `${fmtQty(l.quantity)} × ${l.packName}`)
                      .join(' · ')}
                  </td>
                  <td className='px-3 py-2 text-right whitespace-nowrap tabular-nums'>
                    {fmtQty(v.bulkQuantity)} {getUnitLabel(v.unit)}
                  </td>
                  <td className='px-3 py-2 text-right whitespace-nowrap tabular-nums'>
                    {v.looseQuantity > 0
                      ? `${fmtQty(v.looseQuantity)} ${getUnitLabel(v.unit)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} page={page} onPageChange={setPage} />

      {newOpen && <NewPackingDialog onClose={() => setNewOpen(false)} />}
      {viewing && (
        <PackingDetailSheet
          voucher={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

/* ── New packing (bulk in stock) ─────────────────────────────────────────────── */

function NewPackingDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const { data: products, isLoading: loadingProducts } =
    useGetPackableProductsQuery()
  const [productId, setProductId] = useState('')
  const { data: setup, isFetching } = useGetPackingSetupQuery(
    productId ? { productId } : skipToken
  )
  const [batchId, setBatchId] = useState('')
  const [counts, setCounts] = useState<PackCounts>({})
  const [date, setDate] = useState(todayKey())
  const [notes, setNotes] = useState('')
  const [sizesOpen, setSizesOpen] = useState(false)
  const [post, { isLoading: posting }] = usePostPackingMutation()

  useEffect(() => {
    if (!productId && products && products.length === 1)
      setProductId(products[0].id)
  }, [products, productId])
  useEffect(() => {
    setCounts({})
    setBatchId('')
  }, [productId])

  const sizes = useMemo(
    () => (setup?.sizes || []).filter((s) => s.isActive),
    [setup]
  )
  const bulk = setup?.product
  const tracked = !!bulk?.tracking.trackBatch && (bulk?.batches.length || 0) > 0
  const batch = bulk?.batches.find((b) => b.id === batchId)
  const available = batch ? batch.quantity : bulk?.available || 0
  const summary = packingSummary(sizes, counts, available)

  const problems = [
    !productId && t('Choose the product to pack'),
    bulk && !bulk.packable && bulk.problem,
    productId &&
      sizes.length === 0 &&
      !isFetching &&
      t('This product has no pack sizes in use'),
    productId && summary.lines.length === 0 && t('Enter how many packs'),
    summary.over && t('The packs hold more than there is to pack'),
    summary.shortMaterials.length > 0 &&
      `${t('Not enough packing material')}: ${summary.shortMaterials.join(', ')}`,
  ].filter(Boolean) as string[]

  const submit = async () => {
    if (problems.length || posting) return
    try {
      const v = await post({
        productId,
        lines: summary.lines,
        batchId: batchId || null,
        packingDate: date,
        notes,
      }).unwrap()
      toast.success(
        `${v.voucherNumber} · ${fmtQty(summary.packs)} ${t('packs')} (${fmtQty(summary.packed)} ${getUnitLabel(v.unit)})`
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not post the packing')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <div className='flex items-center gap-3 pr-6'>
            <span className='bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
              <Boxes className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>{t('New packing')}</DialogTitle>
              <DialogDescription>
                {t('Pack bulk that is already in stock into cartons and bags')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          {!loadingProducts && (products || []).length === 0 ? (
            <EmptyState
              icon={Settings2}
              title={t('No product has pack sizes yet')}
              description={t(
                'Open Products, find the finished good (e.g. the bulk made in kg), and choose ⋯ → Pack sizes.'
              )}
              action={
                <Button size='sm' variant='outline' asChild>
                  <Link to={'/manufacturing/products' as never}>
                    {t('Open Products')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]'>
                <div className='min-w-0 space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {t('Product to pack')}
                  </Label>
                  <SearchableSelect
                    options={(products || []).map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: `${fmtQty(p.available)} ${getUnitLabel(p.unit)} ${t('in stock')} · ${p.sizes} ${t('pack sizes')}`,
                    }))}
                    value={productId}
                    onValueChange={setProductId}
                    placeholder={t('Choose the bulk product')}
                    searchPlaceholder={t('Search product')}
                  />
                </div>
                <div className='space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {t('Packing date')}
                  </Label>
                  <Input
                    type='date'
                    value={date}
                    max={todayKey()}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className='h-9'
                  />
                </div>
              </div>

              {bulk && tracked && (
                <div className='space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {t('Batch')}
                  </Label>
                  <SearchableSelect
                    options={[
                      {
                        value: '',
                        label: t('Oldest first (FEFO)'),
                        sublabel: `${fmtQty(bulk.available)} ${getUnitLabel(bulk.unit)}`,
                      },
                      ...bulk.batches.map((b) => ({
                        value: b.id,
                        label: b.batchNumber,
                        sublabel: `${fmtQty(b.quantity)} ${getUnitLabel(bulk.unit)}${b.expiryDate ? ` · ${t('exp')} ${formatAppDate(new Date(b.expiryDate))}` : ''}`,
                      })),
                    ]}
                    value={batchId}
                    onValueChange={setBatchId}
                    placeholder={t('Oldest first (FEFO)')}
                  />
                </div>
              )}

              {productId && isFetching && !setup ? (
                <Skeleton className='h-40 w-full' />
              ) : bulk && sizes.length > 0 ? (
                <PackingGrid
                  sizes={sizes}
                  counts={counts}
                  onChange={setCounts}
                  available={available}
                  unit={bulk.unit}
                  availableLabel={
                    batch
                      ? `${t('In batch')} ${batch.batchNumber}`
                      : t('Bulk in stock')
                  }
                />
              ) : null}

              {bulk && (
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs'
                  onClick={() => setSizesOpen(true)}
                >
                  <Settings2 className='h-3.5 w-3.5' />
                  {t('Pack sizes of')} {bulk.name}
                </button>
              )}

              {productId && (
                <div className='space-y-1'>
                  <Label
                    htmlFor='packing-notes'
                    className='text-muted-foreground text-xs'
                  >
                    {t('Notes')}
                  </Label>
                  <Textarea
                    id='packing-notes'
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {productId && problems.length > 0 && (
          <ul className='space-y-1 border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            {problems.map((p) => (
              <li key={p} className='flex gap-1.5'>
                <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                {p}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className='bg-muted/30 flex-row items-center gap-2 border-t px-5 py-3 sm:justify-between'>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {summary.packs > 0 &&
              bulk &&
              `${fmtQty(summary.packs)} ${t('packs')} · ${fmtQty(summary.packed)} ${getUnitLabel(bulk.unit)} ${t('of bulk')}`}
          </div>
          <div className='ml-auto flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={submit}
              disabled={problems.length > 0 || posting}
              title='Ctrl+Enter'
            >
              {posting ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <PackageCheck className='h-4 w-4' />
              )}
              {t('Post packing')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {sizesOpen && productId && (
        <PackSizesSheet
          productId={productId}
          onClose={() => setSizesOpen(false)}
        />
      )}
    </Dialog>
  )
}

/* ── One voucher ─────────────────────────────────────────────────────────────── */

function PackingDetailSheet({
  voucher: initial,
  onClose,
}: {
  voucher: PackingVoucher
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canCancel = hasPermission('manageProductionOrders')
  const canSeeCosts = useCanViewManufacturingCosts()
  const formatMoney = useFormatMoney()
  const [voucher, setVoucher] = useState(initial)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [cancel, { isLoading: cancelling }] = useCancelPackingMutation()
  const u = getUnitLabel(voucher.unit)
  const cancelled = voucher.status === 'cancelled'

  const doCancel = async () => {
    if (reason.trim().length < 2) return
    try {
      const v = await cancel({ id: voucher.id, reason: reason.trim() }).unwrap()
      setVoucher({ ...voucher, ...v, id: voucher.id })
      setCancelOpen(false)
      toast.success(
        `${voucher.voucherNumber} ${t('cancelled — stock put back')}`
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not cancel the packing')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-xl'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <Package2 className='h-4 w-4' />
            <span className={cn('font-mono', cancelled && 'line-through')}>
              {voucher.voucherNumber}
            </span>
            {cancelled && (
              <Badge
                variant='outline'
                className='border-rose-500/40 text-rose-600'
              >
                {t('Cancelled')}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {voucher.productName} ·{' '}
            {formatAppDateTime(new Date(voucher.packingDate))}
            {voucher.createdByName ? ` · ${voucher.createdByName}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm'>
          <dl className='grid grid-cols-2 gap-3'>
            <Info label={t('Batch')} value={voucher.batchNumber || '—'} mono />
            <Info
              label={t('Production order')}
              value={voucher.orderNumber || '—'}
              mono
            />
            <Info
              label={t('Bulk packed')}
              value={`${fmtQty(voucher.bulkQuantity)} ${u}`}
            />
            <Info
              label={t('Left loose')}
              value={
                voucher.looseQuantity > 0
                  ? `${fmtQty(voucher.looseQuantity)} ${u}`
                  : '—'
              }
            />
          </dl>

          <section className='space-y-2'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {t('Packs made')}
            </h3>
            <div className='divide-y rounded-lg border'>
              {voucher.lines.map((l) => (
                <div
                  key={l._id}
                  className='flex items-center justify-between gap-3 px-3 py-2'
                >
                  <div className='min-w-0'>
                    <div className='truncate font-medium'>{l.packName}</div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {l.productName} · {fmtQty(l.contentQuantity)} {u}{' '}
                      {t('each')}
                      {l.batchNumber ? ` · ${t('batch')} ${l.batchNumber}` : ''}
                    </div>
                  </div>
                  <div className='shrink-0 text-right tabular-nums'>
                    <div className='font-semibold'>
                      {fmtQty(l.quantity)} {getUnitLabel(l.unit)}
                    </div>
                    {canSeeCosts && l.unitCost != null && (
                      <div className='text-muted-foreground text-xs'>
                        {formatMoney(l.unitCost)} / {getUnitLabel(l.unit)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className='space-y-2'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              {t('Used')}
            </h3>
            <div className='divide-y rounded-lg border'>
              {voucher.consumed.map((c) => (
                <div
                  key={`${c.role}:${c.productId}`}
                  className='flex items-center justify-between gap-3 px-3 py-2'
                >
                  <div className='min-w-0'>
                    <div className='truncate'>
                      {c.productName}
                      <span className='text-muted-foreground ml-1.5 text-xs'>
                        {c.role === 'bulk' ? t('bulk') : t('packing material')}
                      </span>
                    </div>
                    {c.batches && c.batches.length > 0 && (
                      <div className='text-muted-foreground truncate text-xs'>
                        {c.batches
                          .map((b) => `${b.batchNumber}: ${fmtQty(b.quantity)}`)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className='shrink-0 text-right tabular-nums'>
                    <div>
                      {fmtQty(c.quantity)} {getUnitLabel(c.unit)}
                    </div>
                    {canSeeCosts && c.totalCost != null && (
                      <div className='text-muted-foreground text-xs'>
                        {formatMoney(c.totalCost)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canSeeCosts && voucher.totalCost != null && (
              <p className='text-muted-foreground text-right text-xs'>
                {t('Packed value')}{' '}
                <span className='text-foreground font-semibold'>
                  {formatMoney(voucher.totalCost)}
                </span>
              </p>
            )}
          </section>

          {voucher.notes && (
            <p className='text-muted-foreground whitespace-pre-wrap'>
              {voucher.notes}
            </p>
          )}
          {cancelled && (
            <p className='rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400'>
              {t('Cancelled')}
              {voucher.cancelledAt
                ? ` ${formatAppDateTime(new Date(voucher.cancelledAt))}`
                : ''}
              {voucher.cancelledBy?.name
                ? ` · ${voucher.cancelledBy.name}`
                : ''}{' '}
              — {voucher.cancelReason}
            </p>
          )}

          {cancelOpen && (
            <div className='space-y-2 rounded-lg border border-rose-500/30 p-3'>
              <Label htmlFor='cancel-reason'>
                {t('Why cancel this packing?')}
              </Label>
              <Textarea
                id='cancel-reason'
                rows={2}
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('Wrong count, wrong pack size…')}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'The packs leave stock and the bulk and packing material go back. Refused if some packs were already sold.'
                )}
              </p>
              <div className='flex justify-end gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setCancelOpen(false)}
                >
                  {t('Keep it')}
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  disabled={reason.trim().length < 2 || cancelling}
                  onClick={doCancel}
                >
                  {cancelling && <Loader2 className='h-4 w-4 animate-spin' />}
                  {t('Cancel packing')}
                </Button>
              </div>
            </div>
          )}
        </div>
        {!cancelled && canCancel && !cancelOpen && (
          <div className='bg-muted/30 flex justify-end border-t px-5 py-3'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCancelOpen(true)}
            >
              <Ban className='h-4 w-4' />
              {t('Cancel packing')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Info({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className={cn('truncate font-medium', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  )
}
