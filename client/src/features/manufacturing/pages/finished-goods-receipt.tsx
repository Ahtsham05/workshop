import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import {
  useGetProductionOrderQuery,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import { DockedFooter } from '@/components/docked-footer'
import { PriorityText, StatusBadge } from '../components/badges'
import { InspectOutputDialog } from '../components/execution-dialogs'
import { PageHeader } from '../components/page'
import { PackSizesSheet } from '../components/pack-sizes-sheet'
import { ReadyToReceiveGrid } from '../components/ready-to-receive'
import { NoPackingConfirm } from '../components/receipt-packing-used'
import {
  OrderStrip,
  ProgressAfter,
  SummaryStat,
} from '../components/receipt-parts'
import {
  ReceiptProblems,
  ReceiveFinishedGoodsForm,
} from '../components/receive-finished-goods-form'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'
import { useFinishedGoodsReceipt } from '../lib/use-finished-goods-receipt'
import { useReceivableOrders } from '../lib/use-receivable-orders'

const EPS = 1e-6
const LIST = '/manufacturing/finished-goods'

/**
 * Finished goods receipt voucher: choose the finished good (the production order it was
 * made on), then the full receipt — packing, packing material used, quantity made, what
 * that takes off the floor, quality and batch — with a running summary beside it. The
 * same details as the "Receive finished goods" dialog on the order, on a page of its own.
 */
export default function FinishedGoodsReceiptPage({
  orderId: initialOrderId,
}: {
  orderId?: string
}) {
  const { t } = useLanguage()
  const receivable = useReceivableOrders()
  const [orderId, setOrderId] = useState(initialOrderId || '')
  // Bumped by "Receive more" — a fresh voucher on the same order.
  const [round, setRound] = useState(0)
  const { data: order, isFetching } = useGetProductionOrderQuery(orderId, {
    skip: !orderId,
  })

  const options = useMemo(
    () =>
      receivable.orders.map((o) => ({
        value: o.id,
        label: `${o.productName} — ${o.orderNumber}`,
        sublabel: `${fmtQty(o.producedQuantity)} / ${fmtQty(o.plannedQuantity)} ${getUnitLabel(o.unit)} ${t('made')} · ${
          o.remainingQuantity > EPS
            ? `${fmtQty(o.remainingQuantity)} ${t('left')}`
            : t('All made')
        } · ${t(o.status.replace('_', ' '))}`,
      })),
    [receivable.orders, t]
  )

  // Came from an order: back to it. Otherwise back to the Finished Goods page.
  const back =
    initialOrderId && order
      ? { to: orderPath(order), label: order.orderNumber }
      : { to: LIST, label: t('Finished goods') }

  const picker = (
    <SearchableSelect
      options={options}
      value={orderId}
      deselectable={false}
      onValueChange={(v) => v && setOrderId(v)}
      placeholder={t('Choose the finished good / production order')}
      searchPlaceholder={t('Search product or order number…')}
      emptyText={t('No production orders on the floor')}
    />
  )

  return (
    <div className='space-y-4'>
      <nav className='text-muted-foreground flex items-center gap-1.5 text-sm'>
        <Link
          to={back.to as never}
          className='hover:text-foreground inline-flex items-center gap-1'
        >
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
          {back.label}
        </Link>
      </nav>
      <PageHeader
        title={t('Finished goods receipt')}
        description={t(
          'Choose the finished good, then report what was made and put it into stock — straight to finished stock, or through quality control. The material it used comes off the production floor.'
        )}
      />

      {!orderId ? (
        <section className='bg-card space-y-4 rounded-xl border p-4'>
          <SectionTitle n={1} title={t('Finished good')} />
          {picker}
          <div className='space-y-2'>
            <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('Ready to receive')}
            </div>
            <ReadyToReceiveGrid
              compact
              orders={receivable.orders}
              loading={receivable.isLoading}
              onPick={(o) => setOrderId(o.id)}
            />
          </div>
        </section>
      ) : !order || (isFetching && order.id !== orderId) ? (
        <div className='space-y-4'>
          <Skeleton className='h-96 w-full rounded-xl' />
          <Skeleton className='h-16 w-full rounded-xl' />
        </div>
      ) : (
        <ReceiptVoucher
          key={`${order.id}:${round}`}
          order={order}
          picker={picker}
          onReceiveMore={() => setRound((n) => n + 1)}
          onAnother={() => {
            setOrderId('')
            setRound((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

/** The receipt for one order: the full-width form, with the summary and Post in a bar docked to the bottom. */
function ReceiptVoucher({
  order,
  picker,
  onReceiveMore,
  onAnother,
}: {
  order: ProductionOrder
  picker: React.ReactNode
  onReceiveMore: () => void
  onAnother: () => void
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const r = useFinishedGoodsReceipt(order)
  const unit = getUnitLabel(order.unit)
  const direct = r.mode === 'direct'
  const [posted, setPosted] = useState<ProductionOutput | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [sizesOpen, setSizesOpen] = useState(false)
  const [askPacking, setAskPacking] = useState(false)

  const submit = async (withoutPacking = false) => {
    if (!withoutPacking && r.packingMissing && !r.problems.length) {
      setAskPacking(true)
      return
    }
    const out = await r.post()
    if (out) setPosted(out)
  }

  // Ctrl+Enter posts from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !posted) {
        e.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (posted) {
    return (
      <>
        <PostedCard
          output={posted}
          order={order}
          canInspect={r.canInspect}
          onInspect={() => setInspecting(true)}
          onMore={onReceiveMore}
          onAnother={onAnother}
        />
        {inspecting && (
          <InspectOutputDialog
            order={order}
            output={posted}
            onClose={() => {
              setInspecting(false)
              navigate({ to: LIST as never })
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='min-w-0 space-y-4'>
        {/* 1. The finished good */}
        <section className='bg-card space-y-3 rounded-xl border p-4'>
          <SectionTitle n={1} title={t('Finished good')} />
          {picker}
          <OrderStrip order={order} />
          <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs'>
            <StatusBadge status={order.status} orderType={order.orderType} />
            <PriorityText priority={order.priority} />
            {order.bomNumber && (
              <span>
                {t('BOM')}{' '}
                <span className='text-foreground font-mono'>
                  {order.bomNumber}
                  {order.bomVersion ? ` v${order.bomVersion}` : ''}
                </span>
              </span>
            )}
            {order.plannedCompletionDate && (
              <span>
                {t('Due')}{' '}
                <span className='text-foreground'>
                  {fmtDate(order.plannedCompletionDate)}
                </span>
              </span>
            )}
            <Link
              to={orderPath(order) as never}
              className='text-primary ml-auto inline-flex items-center gap-1 font-medium hover:underline'
            >
              {t('Open')} {order.orderNumber}
              <ArrowRight className='h-3 w-3' />
            </Link>
          </div>
        </section>

        {/* 2. The receipt — the same details as the order's dialog */}
        <section className='bg-card space-y-4 rounded-xl border p-4'>
          <SectionTitle n={2} title={t('What was made')} />
          <ReceiveFinishedGoodsForm
            r={r}
            order={order}
            showOrder={false}
            onSetUpPacks={() => setSizesOpen(true)}
          />
        </section>
      </div>

      {/* Summary + Post — docked to the bottom of the screen while the form scrolls.
          Phones keep only Made / where it goes + the buttons so the bar stays short. */}
      <DockedFooter label={t('Receipt summary')} className='space-y-3'>
        <ReceiptProblems problems={r.problems} />
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6'>
          <dl className='grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:items-center xl:gap-x-8'>
            <SummaryStat
              label={t('Made')}
              value={`${fmtQty(r.quantity)} ${unit}`}
              strong
            />
            {direct ? (
              <>
                <SummaryStat
                  label={t('To finished stock')}
                  value={fmtQty(r.good)}
                  tone='ok'
                />
                <SummaryStat
                  label={
                    r.quality.disposition === 'rework'
                      ? t('Rejected → rework')
                      : t('Rejected → scrap')
                  }
                  value={fmtQty(r.rejected)}
                  tone={r.rejected > EPS ? 'bad' : undefined}
                />
              </>
            ) : (
              <SummaryStat
                label={t('To the QC hold')}
                value={fmtQty(r.quantity)}
                tone='info'
              />
            )}
            {direct && r.packEnabled && r.packing.packs > 0 && (
              <SummaryStat
                className='max-sm:hidden'
                label={t('Packed')}
                value={`${fmtQty(r.packing.packs)} ${t('packs')}${
                  r.packing.loose > EPS
                    ? ` + ${fmtQty(r.packing.loose)} ${unit} ${t('loose')}`
                    : ''
                }`}
              />
            )}
            <SummaryStat
              className='max-sm:hidden'
              label={t('Material used (at cost)')}
              value={formatMoney(r.materialCost)}
            />
            {r.quantity > 0 && (
              <SummaryStat
                className='max-sm:hidden'
                label={t('Cost per unit')}
                value={formatMoney(r.materialCost / r.quantity)}
              />
            )}
            <div className='col-span-full xl:w-48 xl:flex-none max-sm:hidden'>
              <ProgressAfter
                order={order}
                quantity={r.quantity}
                good={direct ? r.good : 0}
              />
            </div>
          </dl>
          <div className='flex shrink-0 gap-2 max-sm:w-full max-sm:[&>*]:flex-1'>
            <Button variant='outline' onClick={onAnother}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={!!r.problems.length || r.posting}
              className='min-w-52 justify-between gap-3'
            >
              <span className='flex items-center gap-1.5'>
                {r.posting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : direct ? (
                  <PackageCheck className='h-4 w-4' />
                ) : (
                  <ClipboardCheck className='h-4 w-4' />
                )}
                {direct ? t('Receive into stock') : t('Send to QC')}
              </span>
              <kbd className='text-[10px] opacity-70 max-sm:hidden'>Ctrl+Enter</kbd>
            </Button>
          </div>
        </div>
      </DockedFooter>

      <NoPackingConfirm
        r={r}
        open={askPacking}
        onClose={() => setAskPacking(false)}
        onConfirm={() => {
          setAskPacking(false)
          void submit(true)
        }}
        label={`${fmtQty(r.quantity)} ${unit} ${t('of')} ${order.productName}`}
      />
      {sizesOpen && (
        <PackSizesSheet
          productId={order.productId}
          variantId={order.variantId || null}
          onClose={() => setSizesOpen(false)}
        />
      )}
    </div>
  )
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className='flex items-center gap-2'>
      <span className='bg-primary/10 text-primary flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold'>
        {n}
      </span>
      <h3 className='text-sm font-semibold'>{title}</h3>
    </div>
  )
}

/** After posting: what happened, and what to do next. */
function PostedCard({
  output,
  order,
  canInspect,
  onInspect,
  onMore,
  onAnother,
}: {
  output: ProductionOutput
  order: ProductionOrder
  canInspect: boolean
  onInspect: () => void
  onMore: () => void
  onAnother: () => void
}) {
  const { t } = useLanguage()
  const held = output.status === 'pending_qc'
  return (
    <div className='bg-card mx-auto max-w-xl space-y-4 rounded-xl border p-6 text-center'>
      <CheckCircle2 className='mx-auto h-10 w-10 text-emerald-600' />
      <div>
        <div className='text-lg font-semibold'>
          {held ? t('Sent to quality control') : t('Received into stock')}
        </div>
        <div className='text-muted-foreground text-sm'>
          <span className='font-mono'>{output.outputNumber}</span> ·{' '}
          {fmtQty(output.producedQuantity)} {getUnitLabel(output.unit)}{' '}
          {output.productName} · {order.orderNumber}
        </div>
      </div>
      <div className='grid grid-cols-1 gap-2 text-sm sm:grid-cols-3'>
        {held ? (
          <div className='rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 sm:col-span-3'>
            <div className='text-xl font-semibold text-sky-700 tabular-nums dark:text-sky-300'>
              {fmtQty(output.producedQuantity)}
            </div>
            <div className='text-muted-foreground text-xs'>
              {t('waiting for inspection')}
            </div>
          </div>
        ) : (
          <>
            <div className='rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3'>
              <div className='text-xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-300'>
                {fmtQty(output.goodQuantity)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('to finished stock')}
              </div>
            </div>
            <div className='rounded-lg border p-3'>
              <div className='text-xl font-semibold tabular-nums'>
                {fmtQty(output.rejectedQuantity)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('rejected')}
                {output.rejectedQuantity > 0 && output.rejectDisposition
                  ? ` → ${t(output.rejectDisposition)}`
                  : ''}
              </div>
            </div>
            <div className='rounded-lg border p-3'>
              <div className='text-xl font-semibold tabular-nums'>
                {fmtQty(output.consumption?.length || 0)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('material lots used')}
              </div>
            </div>
          </>
        )}
      </div>
      <div className='flex flex-wrap justify-center gap-2'>
        {held && canInspect && (
          <Button onClick={onInspect}>
            <ShieldCheck className='mr-1.5 h-4 w-4' />
            {t('Inspect now')}
          </Button>
        )}
        <Button variant='outline' onClick={onMore}>
          <RefreshCw className='mr-1.5 h-4 w-4' />
          {t('Receive more')}
        </Button>
        <Button variant='outline' onClick={onAnother}>
          <PackageCheck className='mr-1.5 h-4 w-4' />
          {t('Another finished good')}
        </Button>
        <Button asChild variant='ghost'>
          <Link to={LIST as never}>{t('All receipts')}</Link>
        </Button>
      </div>
    </div>
  )
}
