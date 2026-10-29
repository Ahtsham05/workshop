import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Network,
  PackageCheck,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import {
  useGetOutputsQuery,
  useGetProductionReceiptsQuery,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { DetailSheet, SheetSection } from '../components/detail-sheet'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import {
  OrderReceiptDialogs,
  type OrderReceiptAction,
} from '../components/order-receipt-dialogs'
import { EmptyState, Field, PageHeader, Panel, Stat, StatGrid } from '../components/page'
import { Pager } from '../components/pager'
import { ReadyToReceiveGrid } from '../components/ready-to-receive'
import {
  OUTPUT_REVERSAL_REASON_LABELS,
  fmtDate,
  fmtQty,
  refName,
} from '../lib/constants'
import { useReceivableOrders } from '../lib/use-receivable-orders'

const EPS = 1e-6
type StatusFilter = 'all' | 'inspected' | 'pending_qc' | 'reversed'

/** Where a receipt's units are now, in plant words. */
function VoucherStatus({ output }: { output: ProductionOutput }) {
  const { t } = useLanguage()
  const meta =
    output.status === 'reversed'
      ? { label: 'Reversed', className: 'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300' }
      : output.status === 'pending_qc'
        ? { label: 'In QC', className: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300' }
        : output.goodQuantity > EPS
          ? { label: 'In stock', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300' }
          : { label: 'Rejected', className: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300' }
  return (
    <Badge variant='outline' className={cn('font-medium', meta.className)}>
      {t(meta.label)}
    </Badge>
  )
}

/**
 * Finished goods, on their own page: what is on the floor ready to receive (one tap opens
 * the full receipt — packing, quantity, material check, quality, batch), and every
 * finished goods receipt voucher posted, with its details, inspection and reversal.
 */
export default function FinishedGoodsPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const { hasPermission } = usePermissions()
  const canReceive = hasPermission('receiveFinishedGoods')
  const canInspect = hasPermission('inspectProduction')

  const receivable = useReceivableOrders()
  const openOrders = receivable.orders.filter((o) => o.remainingQuantity > EPS)
  const leftToMake = openOrders.reduce((n, o) => n + o.remainingQuantity, 0)
  const units = new Set(openOrders.map((o) => o.unit))

  const [action, setAction] = useState<OrderReceiptAction | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>(
    {}
  )
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ProductionOutput | null>(null)
  const { data, isLoading, isFetching } = useGetOutputsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    dateFrom: range.startDate,
    dateTo: range.endDate,
    ...(status !== 'all' ? { status } : {}),
  })
  const filtered = !!debounced || !!range.startDate || status !== 'all'

  const columns: Column<ProductionOutput>[] = [
    {
      id: 'voucher',
      header: t('Voucher'),
      className: 'w-40',
      cell: (o) => (
        <CellStack
          mono
          primary={o.outputNumber}
          secondary={fmtDate(o.reportedAt)}
        />
      ),
    },
    {
      id: 'product',
      header: t('Finished good'),
      cell: (o) => (
        <div className='min-w-0'>
          <div className='truncate font-medium'>{o.productName}</div>
          <Link
            to={
              `/manufacturing/production-orders/${o.productionOrderId}` as never
            }
            onClick={(e) => e.stopPropagation()}
            className='text-muted-foreground font-mono text-xs hover:underline'
          >
            {o.orderNumber}
          </Link>
        </div>
      ),
    },
    {
      id: 'made',
      header: t('Made'),
      align: 'right',
      cell: (o) => (
        <span className='tabular-nums'>
          {fmtQty(o.producedQuantity)}{' '}
          <span className='text-muted-foreground text-xs'>
            {getUnitLabel(o.unit)}
          </span>
        </span>
      ),
    },
    {
      id: 'good',
      header: t('Good / rejected'),
      align: 'right',
      hideBelow: 'md',
      cell: (o) =>
        o.status === 'pending_qc' ? (
          <span className='text-muted-foreground text-xs'>
            {t('awaiting QC')}
          </span>
        ) : (
          <span className='tabular-nums'>
            <span className='text-emerald-700 dark:text-emerald-400'>
              {fmtQty(o.goodQuantity)}
            </span>
            <span className='text-muted-foreground'> / </span>
            <span
              className={
                o.rejectedQuantity > EPS
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground'
              }
            >
              {fmtQty(o.rejectedQuantity)}
            </span>
          </span>
        ),
    },
    {
      id: 'value',
      header: t('Value'),
      money: true,
      align: 'right',
      hideBelow: 'lg',
      cell: (o) => (
        <span className='tabular-nums'>{formatMoney(o.materialCost)}</span>
      ),
    },
    {
      id: 'by',
      header: t('Received by'),
      hideBelow: 'xl',
      cell: (o) => (
        <span className='text-muted-foreground'>
          {refName(o.reportedBy) || '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      align: 'right',
      cell: (o) => <VoucherStatus output={o} />,
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Finished goods')}
        description={t(
          'Receive what the floor has made into stock, and every finished goods receipt voucher with its quantity, quality, batch and cost.'
        )}
        actions={
          canReceive && (
            <Button asChild>
              <Link to={'/manufacturing/finished-goods/receive' as never}>
                <PackageCheck className='mr-1.5 h-4 w-4' />
                {t('Receive finished goods')}
              </Link>
            </Button>
          )
        }
      />

      <StatGrid className='lg:grid-cols-4'>
        <Stat
          label={t('Ready to receive')}
          value={receivable.isLoading ? '—' : openOrders.length}
          hint={t('production orders on the floor')}
        />
        <Stat
          label={t('Left to make')}
          value={
            receivable.isLoading
              ? '—'
              : units.size === 1
                ? `${fmtQty(leftToMake)} ${getUnitLabel([...units][0])}`
                : fmtQty(leftToMake)
          }
          hint={t('across the open orders')}
        />
        <Stat
          label={t('Awaiting QC')}
          value={fmtQty(receivable.data?.totals.qcPendingQuantity ?? 0)}
          tone='warning'
          active={(receivable.data?.totals.qcPendingQuantity ?? 0) > 0}
          onClick={() => {
            setStatus('pending_qc')
            setPage(1)
          }}
        />
        <Stat
          label={t('Awaiting rework')}
          value={fmtQty(receivable.data?.totals.reworkPendingQuantity ?? 0)}
          tone='warning'
          active={(receivable.data?.totals.reworkPendingQuantity ?? 0) > 0}
        />
      </StatGrid>

      <Panel
        title={t('Ready to receive')}
        description={
          canReceive
            ? t('Tap an order to receive its finished goods — the same full receipt as on the order.')
            : t('Production orders on the floor and what is left to make.')
        }
        contentClassName='p-4 max-sm:p-3'
      >
        <ReadyToReceiveGrid
          orders={receivable.orders}
          loading={receivable.isLoading}
          canReceive={canReceive}
          onPick={(o) => setAction({ kind: 'receive', orderId: o.id })}
        />
      </Panel>

      <div className='space-y-3'>
        <div>
          <h3 className='text-base font-semibold'>{t('Receipt vouchers')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Every finished goods receipt — open one for its full details.')}
          </p>
        </div>
        <Toolbar
          end={
            <DateRangeFilter
              startDate={range.startDate}
              endDate={range.endDate}
              onChange={(r) => {
                setRange(r)
                setPage(1)
              }}
            />
          }
        >
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder={t('Search voucher, order or product')}
          />
          <FilterChips
            label={t('Receipt status')}
            value={status}
            onChange={(v) => {
              setStatus(v as StatusFilter)
              setPage(1)
            }}
            options={[
              { value: 'all', label: t('All') },
              { value: 'inspected', label: t('Received') },
              { value: 'pending_qc', label: t('In QC') },
              { value: 'reversed', label: t('Reversed') },
            ]}
          />
        </Toolbar>
        <DataTable
          caption={t('Receipt vouchers')}
          columns={columns.filter((c) => canSeeCosts || c.id !== 'value')}
          rows={data?.results}
          rowKey={(o) => o.id}
          loading={isLoading}
          fetching={isFetching}
          onRowClick={setOpen}
          empty={
            <EmptyState
              bordered={false}
              icon={PackageCheck}
              title={
                filtered
                  ? t('Nothing matches these filters')
                  : t('No finished goods received yet')
              }
              description={
                filtered
                  ? t('Try another status, date range or search.')
                  : t('Receive an order from “Ready to receive” above — its voucher lands here.')
              }
            />
          }
          mobileCard={(o) => (
            <div className='space-y-1'>
              <div className='flex items-start justify-between gap-3'>
                <div className='truncate font-medium'>{o.productName}</div>
                <VoucherStatus output={o} />
              </div>
              <div className='text-muted-foreground flex justify-between gap-3 text-xs'>
                <span className='font-mono'>
                  {o.outputNumber} · {o.orderNumber}
                </span>
                <span className='tabular-nums'>
                  {fmtQty(o.producedQuantity)} {getUnitLabel(o.unit)}
                </span>
              </div>
            </div>
          )}
          footer={
            data && data.totalPages > 1 ? (
              <Pager data={data} page={page} onPageChange={setPage} />
            ) : undefined
          }
        />
      </div>

      {open && (
        <VoucherSheet
          output={open}
          canInspect={canInspect}
          canReverse={canReceive}
          onClose={() => setOpen(null)}
          onAction={(a) => {
            setOpen(null)
            setAction(a)
          }}
        />
      )}

      {action && (
        <OrderReceiptDialogs
          key={`${action.kind}:${action.orderId}`}
          action={action}
          onClose={() => setAction(null)}
          onInspect={(output) =>
            setAction({
              kind: 'inspect',
              orderId: output.productionOrderId,
              output,
            })
          }
        />
      )}
    </div>
  )
}

/** One receipt voucher in full: quantities, quality, batch / serials, material used. */
function VoucherSheet({
  output: o,
  canInspect,
  canReverse,
  onClose,
  onAction,
}: {
  output: ProductionOutput
  canInspect: boolean
  canReverse: boolean
  onClose: () => void
  onAction: (action: OrderReceiptAction) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const unit = getUnitLabel(o.unit)
  // The stock receipt it posted holds the batch, serials and location.
  const { data: receipts } = useGetProductionReceiptsQuery(
    { productionOrderId: o.productionOrderId, limit: 100 },
    { skip: !o.receiptId }
  )
  const receipt = receipts?.results.find((r) => r.id === o.receiptId)

  return (
    <DetailSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={<span className='font-mono'>{o.outputNumber}</span>}
      description={`${o.productName} · ${o.orderNumber}`}
      badges={<VoucherStatus output={o} />}
      footer={
        <>
          {o.status === 'pending_qc' && canInspect && (
            <Button
              onClick={() =>
                onAction({
                  kind: 'inspect',
                  orderId: o.productionOrderId,
                  output: o,
                })
              }
            >
              <ShieldCheck className='mr-1.5 h-4 w-4' />
              {t('Inspect')}
            </Button>
          )}
          {o.status !== 'reversed' && canReverse && (
            <Button
              variant='outline'
              onClick={() =>
                onAction({
                  kind: 'reverse',
                  orderId: o.productionOrderId,
                  output: o,
                })
              }
            >
              <Undo2 className='mr-1.5 h-4 w-4' />
              {t('Reverse')}
            </Button>
          )}
          {receipt && (receipt.batchId || !!receipt.imeiIds?.length) && (
            <Button asChild variant='outline'>
              <Link
                to={'/manufacturing/traceability' as never}
                search={
                  (receipt.batchId
                    ? {
                        kind: 'batch',
                        id: receipt.batchId,
                        label: receipt.batchNumber,
                      }
                    : {
                        kind: 'serial',
                        id: receipt.imeiIds?.[0],
                        label: receipt.serialNumbers?.[0],
                      }) as never
                }
              >
                <Network className='mr-1.5 h-3.5 w-3.5' />
                {t('Trace')}
              </Link>
            </Button>
          )}
          <Button asChild variant='outline'>
            <Link
              to={
                `/manufacturing/production-orders/${o.productionOrderId}` as never
              }
            >
              {t('Open order')}
              <ArrowRight className='ml-1.5 h-3.5 w-3.5' />
            </Link>
          </Button>
        </>
      }
    >
      <dl className='grid grid-cols-2 gap-4'>
        <Field label={t('Made')}>
          {fmtQty(o.producedQuantity)} {unit}
        </Field>
        <Field label={t('Date')}>{fmtDate(o.reportedAt)}</Field>
        {o.status !== 'pending_qc' && (
          <>
            <Field label={t('Good → finished stock')}>
              {fmtQty(o.goodQuantity)} {unit}
            </Field>
            <Field label={t('Rejected')}>
              {fmtQty(o.rejectedQuantity)} {unit}
              {o.rejectedQuantity > EPS && o.rejectDisposition
                ? ` → ${t(o.rejectDisposition)}`
                : ''}
            </Field>
          </>
        )}
        {canSeeCosts && (
          <>
            <Field label={t('Material cost')}>
              {formatMoney(o.materialCost)}
            </Field>
            <Field label={t('Cost per unit')}>{formatMoney(o.unitCost)}</Field>
          </>
        )}
        <Field label={t('Received by')}>{refName(o.reportedBy) || '—'}</Field>
        <Field label={t('Quality')}>
          {o.status === 'pending_qc'
            ? t('Waiting in the QC hold')
            : o.directReceipt || !o.inspectedAt
              ? t('Checked on receipt')
              : `${t('Inspected')} ${fmtDate(o.inspectedAt)}${
                  refName(o.inspectedBy) ? ` · ${refName(o.inspectedBy)}` : ''
                }`}
        </Field>
        {receipt?.location && (
          <Field label={t('Location')}>{receipt.location}</Field>
        )}
        {o.rejectReason && (
          <Field label={t('Reject reason')}>{o.rejectReason}</Field>
        )}
      </dl>

      {o.reversal && (
        <SheetSection title={t('Reversed')}>
          <p className='text-sm'>
            {fmtDate(o.reversal.at)}
            {refName(o.reversal.by) ? ` · ${refName(o.reversal.by)}` : ''} ·{' '}
            {t(OUTPUT_REVERSAL_REASON_LABELS[o.reversal.reason])}
          </p>
          {o.reversal.notes && (
            <p className='text-muted-foreground text-sm'>{o.reversal.notes}</p>
          )}
        </SheetSection>
      )}

      {receipt?.batchNumber && (
        <SheetSection title={t('Batch')}>
          <p className='font-mono text-sm'>{receipt.batchNumber}</p>
        </SheetSection>
      )}
      {!!receipt?.serialNumbers?.length && (
        <SheetSection
          title={t('Serial numbers ({{n}})').replace(
            '{{n}}',
            String(receipt.serialNumbers.length)
          )}
        >
          <div className='flex flex-wrap gap-1.5'>
            {receipt.serialNumbers.map((sn) => (
              <span
                key={sn}
                className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'
              >
                {sn}
              </span>
            ))}
          </div>
        </SheetSection>
      )}

      {o.consumption.length > 0 && (
        <SheetSection title={t('Material used')}>
          <ul className='divide-y rounded-lg border text-sm'>
            {o.consumption.map((c, i) => (
              <li
                key={`${c.materialLineId || c.productName}:${i}`}
                className='flex items-center justify-between gap-3 px-3 py-2'
              >
                <span className='min-w-0 truncate'>{c.productName}</span>
                <span className='text-muted-foreground shrink-0 tabular-nums'>
                  {fmtQty(c.quantity)} {getUnitLabel(c.unit)}
                  {canSeeCosts && (
                    <span className='text-foreground ml-2'>
                      {formatMoney(c.cost)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </SheetSection>
      )}

      {(o.notes || o.inspectionNotes) && (
        <SheetSection title={t('Notes')}>
          {o.notes && <p className='text-sm'>{o.notes}</p>}
          {o.inspectionNotes && (
            <p className='text-muted-foreground text-sm'>
              {t('Inspection')}: {o.inspectionNotes}
            </p>
          )}
        </SheetSection>
      )}
    </DetailSheet>
  )
}
