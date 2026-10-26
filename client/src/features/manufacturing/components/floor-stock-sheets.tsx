import { useState } from 'react'
import {
  Ban,
  ClipboardCheck,
  Loader2,
  PackagePlus,
  Undo2,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCancelFloorVoucherMutation,
  useGetFloorMaterialQuery,
  type FloorMoveKind,
  type FloorPeriod,
  type FloorVoucher,
  type FloorVoucherKind,
} from '@/stores/manufacturing.api'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fmtQty } from '../lib/constants'
import { useFormatMoney } from '../lib/use-mfg-money'
import { ProductTypeBadge } from './badges'

export const FLOOR_MOVE_META: Record<
  FloorMoveKind,
  { label: string; className: string }
> = {
  issue: {
    label: 'Issued',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  auto_issue: {
    label: 'Auto-issued',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  used: {
    label: 'Used',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  return: {
    label: 'Returned',
    className: 'border-border bg-muted text-muted-foreground',
  },
  count: {
    label: 'Count',
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
}

export const FLOOR_VOUCHER_LABELS: Record<FloorVoucherKind, string> = {
  issue: 'Issue',
  return: 'Return',
  count: 'Count',
}

const signed = (q: number) =>
  `${q > 0 ? '+' : q < 0 ? '−' : ''}${fmtQty(Math.abs(q))}`

/* ── One material ────────────────────────────────────────────────────────────── */

export function FloorMaterialSheet({
  productId,
  period,
  onAction,
  onOpenVoucher,
  onClose,
}: {
  productId: string
  period: FloorPeriod
  onAction: (kind: FloorVoucherKind, productId: string) => void
  onOpenVoucher: (id: string) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canSeeCosts = useCanViewManufacturingCosts()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetFloorMaterialQuery({ productId, ...period })
  const u = data ? getUnitLabel(data.product.unit) : ''
  const usedTotal = (data?.usedFor || []).reduce((s, x) => s + x.quantity, 0)
  const short = data ? data.openOrderNeed - data.inProduction : 0

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-2xl'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2 pr-6'>
            <Warehouse className='h-4 w-4 shrink-0' />
            <span className='truncate'>{data?.product.name || t('Material')}</span>
          </SheetTitle>
          <SheetDescription className='flex flex-wrap items-center gap-2'>
            {data && <ProductTypeBadge type={data.product.productType} />}
            {data?.product.sku && <span>{data.product.sku}</span>}
            {data && !data.product.isFloor && (
              <Badge variant='outline' className='text-muted-foreground'>
                {t('Production stock off')}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className='space-y-3 p-5'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-40 w-full' />
          </div>
        ) : (
          <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm'>
            <div className='grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4'>
              <Figure
                label={t('In production now')}
                value={`${fmtQty(data.inProduction)} ${u}`}
                hint={
                  canSeeCosts && data.inProductionValue != null
                    ? formatMoney(data.inProductionValue)
                    : undefined
                }
                strong
              />
              <Figure
                label={t('Open orders need')}
                value={`${fmtQty(data.openOrderNeed)} ${u}`}
                hint={
                  short > 1e-6
                    ? `${t('Short')} ${fmtQty(short)} ${u}`
                    : data.openOrderNeed > 0
                      ? t('Covered')
                      : undefined
                }
                tone={short > 1e-6 ? 'warning' : undefined}
              />
              <Figure label={t('Opening')} value={`${fmtQty(data.opening)} ${u}`} />
              <Figure
                label={t('Used in period')}
                value={`${fmtQty(usedTotal)} ${u}`}
              />
            </div>

            <div className='flex flex-wrap gap-2'>
              {hasPermission('issueMaterials') && data.product.isFloor && (
                <Button size='sm' onClick={() => onAction('issue', productId)}>
                  <PackagePlus className='h-4 w-4' />
                  {t('Issue more')}
                </Button>
              )}
              {hasPermission('issueMaterials') && data.inProduction > 0 && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => onAction('return', productId)}
                >
                  <Undo2 className='h-4 w-4' />
                  {t('Return to store')}
                </Button>
              )}
              {hasPermission('manageProductionOrders') && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => onAction('count', productId)}
                >
                  <ClipboardCheck className='h-4 w-4' />
                  {t('Count')}
                </Button>
              )}
            </div>

            <section className='space-y-2'>
              <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                {t('Used in finished goods')}
              </h3>
              {data.usedFor.length === 0 ? (
                <p className='text-muted-foreground text-xs'>
                  {t('Not used in this period.')}
                </p>
              ) : (
                <ul className='space-y-2'>
                  {data.usedFor.map((x) => (
                    <li key={x.productId || x.name}>
                      <div className='flex items-baseline justify-between gap-3'>
                        <span className='truncate'>{x.name}</span>
                        <span className='shrink-0 font-medium tabular-nums'>
                          {fmtQty(x.quantity)} {u}
                          <span className='text-muted-foreground ml-1.5 text-xs font-normal'>
                            {usedTotal > 0
                              ? `${Math.round((x.quantity / usedTotal) * 100)}%`
                              : ''}
                          </span>
                        </span>
                      </div>
                      <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
                        <div
                          className='bg-primary/70 h-full rounded-full'
                          style={{
                            width: `${usedTotal > 0 ? (x.quantity / usedTotal) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.lots.length > 0 && (
              <section className='space-y-2'>
                <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                  {t('On the floor now — used oldest first')}
                </h3>
                <div className='divide-y rounded-lg border'>
                  {data.lots.map((lot, i) => (
                    <div
                      key={lot.id}
                      className='flex items-center justify-between gap-3 px-3 py-2'
                    >
                      <div className='min-w-0'>
                        <span className='font-mono text-xs'>
                          {lot.voucherNumber || '—'}
                        </span>
                        <span className='text-muted-foreground ml-2 text-xs'>
                          {formatAppDate(new Date(lot.issuedAt))}
                          {lot.batchNumber ? ` · ${t('batch')} ${lot.batchNumber}` : ''}
                        </span>
                        {i === 0 && (
                          <span className='ml-2 text-xs text-emerald-700 dark:text-emerald-400'>
                            {t('used next')}
                          </span>
                        )}
                      </div>
                      <span className='shrink-0 font-medium tabular-nums'>
                        {fmtQty(lot.quantity)} {u}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className='space-y-2'>
              <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                {t('Movements')}
              </h3>
              {data.movements.length === 0 ? (
                <p className='text-muted-foreground text-xs'>
                  {t('No movements in this period.')}
                </p>
              ) : (
                <div className='overflow-x-auto rounded-lg border'>
                  <table className='w-full min-w-[520px] text-sm'>
                    <thead className='bg-muted/50 text-muted-foreground text-xs'>
                      <tr className='text-left'>
                        <th className='px-3 py-2 font-medium'>{t('Date')}</th>
                        <th className='px-3 py-2 font-medium'>{t('Document')}</th>
                        <th className='px-3 py-2 font-medium'>{t('Details')}</th>
                        <th className='px-3 py-2 text-right font-medium'>
                          {t('Qty')}
                        </th>
                        <th className='px-3 py-2 text-right font-medium'>
                          {t('Balance')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className='divide-y'>
                      {data.movements.map((m) => {
                        const meta = FLOOR_MOVE_META[m.kind]
                        const clickable = m.refType === 'FloorStockVoucher'
                        return (
                          <tr
                            key={`${m.refId}:${m.kind}`}
                            className={cn(clickable && 'hover:bg-muted/40 cursor-pointer')}
                            onClick={clickable ? () => onOpenVoucher(m.refId) : undefined}
                          >
                            <td className='px-3 py-2 whitespace-nowrap'>
                              {formatAppDate(new Date(m.date))}
                            </td>
                            <td className='px-3 py-2 whitespace-nowrap'>
                              <Badge variant='outline' className={cn('mr-2', meta.className)}>
                                {t(meta.label)}
                              </Badge>
                              <span className='font-mono text-xs'>{m.number}</span>
                            </td>
                            <td className='text-muted-foreground px-3 py-2 text-xs'>
                              {m.kind === 'used' && m.usedFor
                                ? m.usedFor
                                    .map((x) => `${x.name} (${fmtQty(x.quantity)})`)
                                    .join(', ')
                                : m.note}
                              {m.orderNumber ? ` · ${m.orderNumber}` : ''}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums',
                                m.quantity < 0 && m.kind !== 'used' && m.kind !== 'return'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : ''
                              )}
                            >
                              {signed(m.quantity)}
                            </td>
                            <td className='px-3 py-2 text-right whitespace-nowrap tabular-nums'>
                              {fmtQty(m.balance)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Figure({
  label,
  value,
  hint,
  tone,
  strong,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warning'
  strong?: boolean
}) {
  return (
    <div className='bg-card min-w-0 px-3 py-2.5'>
      <div className='text-muted-foreground truncate text-xs'>{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate font-semibold tabular-nums',
          strong && 'text-lg',
          tone === 'warning' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            'truncate text-xs',
            tone === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          )}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

/* ── One voucher ─────────────────────────────────────────────────────────────── */

export function FloorVoucherSheet({
  voucher: initial,
  onClose,
}: {
  voucher: FloorVoucher
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
  const [cancel, { isLoading: cancelling }] = useCancelFloorVoucherMutation()
  const cancelled = voucher.status === 'cancelled'
  const isCount = voucher.kind === 'count'

  const doCancel = async () => {
    if (reason.trim().length < 2) return
    try {
      const v = await cancel({ id: voucher.id, reason: reason.trim() }).unwrap()
      setVoucher({ ...voucher, ...v, id: voucher.id })
      setCancelOpen(false)
      toast.success(`${voucher.voucherNumber} ${t('cancelled — stock put back')}`)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not cancel')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-xl'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex flex-wrap items-center gap-2 pr-6'>
            <span className={cn('font-mono', cancelled && 'line-through')}>
              {voucher.voucherNumber}
            </span>
            <Badge
              variant='outline'
              className={
                FLOOR_MOVE_META[
                  voucher.kind === 'issue' && voucher.auto ? 'auto_issue' : voucher.kind
                ].className
              }
            >
              {voucher.auto ? t('Auto-issued') : t(FLOOR_VOUCHER_LABELS[voucher.kind])}
            </Badge>
            {cancelled && (
              <Badge variant='outline' className='border-rose-500/40 text-rose-600'>
                {t('Cancelled')}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {formatAppDateTime(new Date(voucher.voucherDate))}
            {voucher.createdByName ? ` · ${voucher.createdByName}` : ''}
            {voucher.reason ? ` · ${voucher.reason}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm'>
          {voucher.auto && (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'>
              {t('Posted automatically: production stock was short when')}{' '}
              <span className='font-mono'>{voucher.source?.number}</span>
              {voucher.source?.productName ? ` (${voucher.source.productName})` : ''}{' '}
              {t('was posted, so the rest was taken from the store.')}
            </p>
          )}
          <div className='divide-y rounded-lg border'>
            {voucher.lines.map((l) => (
              <div key={l._id} className='flex items-center justify-between gap-3 px-3 py-2'>
                <div className='min-w-0'>
                  <div className='truncate font-medium'>{l.productName}</div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {isCount
                      ? `${t('Book')} ${fmtQty(l.bookQuantity || 0)} · ${t('Counted')} ${fmtQty(l.countedQuantity || 0)}`
                      : (l.batches || [])
                          .filter((b) => b.batchNumber)
                          .map((b) => `${b.batchNumber}: ${fmtQty(b.quantity)}`)
                          .join(' · ')}
                  </div>
                </div>
                <div className='shrink-0 text-right tabular-nums'>
                  <div
                    className={cn(
                      'font-semibold',
                      isCount && l.quantity < 0 && 'text-rose-600 dark:text-rose-400',
                      isCount && l.quantity > 0 && 'text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {isCount
                      ? Math.abs(l.quantity) < 1e-9
                        ? t('Matches')
                        : signed(l.quantity)
                      : fmtQty(l.quantity)}{' '}
                    {getUnitLabel(l.unit)}
                  </div>
                  {canSeeCosts && l.totalCost != null && l.totalCost !== 0 && (
                    <div className='text-muted-foreground text-xs'>
                      {formatMoney(Math.abs(l.totalCost))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {voucher.notes && (
            <p className='text-muted-foreground whitespace-pre-wrap'>{voucher.notes}</p>
          )}
          {cancelled && (
            <p className='rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400'>
              {t('Cancelled')}
              {voucher.cancelledAt ? ` ${formatAppDateTime(new Date(voucher.cancelledAt))}` : ''}
              {voucher.cancelledBy?.name ? ` · ${voucher.cancelledBy.name}` : ''} —{' '}
              {voucher.cancelReason}
            </p>
          )}
          {cancelOpen && (
            <div className='space-y-2 rounded-lg border border-rose-500/30 p-3'>
              <Label htmlFor='floor-cancel-reason'>{t('Why cancel?')}</Label>
              <Textarea
                id='floor-cancel-reason'
                rows={2}
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('Wrong material, wrong quantity…')}
              />
              <p className='text-muted-foreground text-xs'>
                {voucher.kind === 'issue'
                  ? t('The material goes back to the store. Refused once any of it was used in production — post a return instead.')
                  : voucher.kind === 'return'
                    ? t('The material goes back to production stock.')
                    : t('The count difference is undone.')}
              </p>
              <div className='flex justify-end gap-2'>
                <Button variant='ghost' size='sm' onClick={() => setCancelOpen(false)}>
                  {t('Keep it')}
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  disabled={reason.trim().length < 2 || cancelling}
                  onClick={doCancel}
                >
                  {cancelling && <Loader2 className='h-4 w-4 animate-spin' />}
                  {t('Cancel voucher')}
                </Button>
              </div>
            </div>
          )}
        </div>
        {!cancelled && canCancel && !cancelOpen && (
          <div className='bg-muted/30 flex justify-end border-t px-5 py-3'>
            <Button variant='outline' size='sm' onClick={() => setCancelOpen(true)}>
              <Ban className='h-4 w-4' />
              {t('Cancel voucher')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
