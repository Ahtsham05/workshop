import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react'
import {
  useGetProductionOrderQuery,
  useGetProductionOrdersQuery,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  FinishedGoodsFields,
  InspectOutputDialog,
} from '../components/execution-dialogs'
import { PageHeader } from '../components/page'
import { QualityDecision } from '../components/quality-decision'
import {
  MaterialCheck,
  ModeCard,
  OrderStrip,
  ProgressAfter,
  QuantityStepper,
  QuickChip,
  SummaryRow,
} from '../components/receipt-parts'
import { NoPackingConfirm, ReceiptPackingUsed } from '../components/receipt-packing-used'
import { fmtQty, orderPath } from '../lib/constants'
import { useFinishedGoodsReceipt } from '../lib/use-finished-goods-receipt'

const EPS = 1e-6
const EXECUTABLE = 'released,in_production,paused'

/**
 * Finished goods receipt: report what was made on a production order and put it into
 * stock — straight to finished stock (passed on receipt: good / rejected → scrap or rework)
 * or into the QC hold for inspection. Shows, before posting, what the output backflushes
 * from the floor and how much the issued material covers.
 */
export default function FinishedGoodsReceiptPage({
  orderId: initialOrderId,
}: {
  orderId?: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const [orderId, setOrderId] = useState(initialOrderId || '')
  const { data: orderPage } = useGetProductionOrdersQuery({
    status: EXECUTABLE,
    limit: 100,
    sortBy: 'createdAt:desc',
  } as never)
  const { data: order, isFetching: orderLoading } = useGetProductionOrderQuery(
    orderId,
    { skip: !orderId }
  )
  const receipt = useFinishedGoodsReceipt(order)
  const {
    settings,
    canInspect,
    qcRequired,
    directBlocked,
    mode,
    setQcMode,
    qty,
    quantity,
    setQuantity,
    quality,
    setQuality,
    good,
    rejected,
    fg,
    setFg,
    notes,
    setNotes,
    remaining,
    buildable,
    lines,
    materialCost,
    overPlan,
    problems,
    posting,
  } = receipt
  const [posted, setPosted] = useState<ProductionOutput | null>(null)
  const [inspecting, setInspecting] = useState(false)

  const [askPacking, setAskPacking] = useState(false)
  const submit = async (withoutPacking = false) => {
    if (!withoutPacking && receipt.packingMissing && !receipt.problems.length) {
      setAskPacking(true)
      return
    }
    const out = await receipt.post()
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

  const orderOptions = useMemo(
    () =>
      (orderPage?.results || []).map((o) => ({
        value: o.id,
        label: `${o.orderNumber} — ${o.productName}`,
        sublabel: `${fmtQty(o.producedQuantity || 0)} / ${fmtQty(o.plannedQuantity)} ${o.unit} ${t('made')} · ${t(o.status.replace('_', ' '))}`,
      })),
    [orderPage, t]
  )

  const back = order
    ? { to: orderPath(order), label: order.orderNumber }
    : { to: '/manufacturing/production-orders', label: t('Production orders') }

  return (
    <div className='space-y-4'>
      <NoPackingConfirm
        r={receipt}
        open={askPacking}
        onClose={() => setAskPacking(false)}
        onConfirm={() => {
          setAskPacking(false)
          void submit(true)
        }}
        label={
          order
            ? `${fmtQty(receipt.quantity)} ${getUnitLabel(order.unit)} ${t('of')} ${order.productName}`
            : ''
        }
      />
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
        title={t('Receive finished goods')}
        description={t(
          'Report what was made and put it into stock — straight to finished stock, or through quality control. The material it used comes off the production floor.'
        )}
      />

      {posted && order ? (
        <PostedCard
          output={posted}
          order={order}
          canInspect={canInspect}
          onInspect={() => setInspecting(true)}
          onMore={() => {
            setPosted(null)
            receipt.reset()
          }}
        />
      ) : (
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
          <div className='min-w-0 space-y-4'>
            {/* 1. Order */}
            <section className='bg-card space-y-3 rounded-xl border p-4'>
              <SectionTitle n={1} title={t('Production order')} />
              <SearchableSelect
                options={orderOptions}
                value={orderId}
                deselectable={false}
                onValueChange={(v) => v && setOrderId(v)}
                placeholder={t('Choose the order the goods were made on')}
                searchPlaceholder={t('Search order number or product…')}
                emptyText={t('No open production orders')}
              />
              {orderId && (!order || orderLoading) ? (
                <Skeleton className='h-16 w-full rounded-lg' />
              ) : (
                order && <OrderStrip order={order} />
              )}
            </section>

            {order && (
              <>
                {/* 2. Quantity made + what it uses */}
                <section className='bg-card space-y-4 rounded-xl border p-4'>
                  <SectionTitle n={2} title={t('Quantity made')} />
                  <div className='flex flex-wrap items-end gap-3'>
                    <QuantityStepper
                      value={qty}
                      onChange={setQuantity}
                      unit={order.unit}
                      autoFocus
                    />
                    <div className='flex flex-wrap gap-1.5'>
                      <QuickChip
                        label={t('All remaining')}
                        value={remaining}
                        onClick={() => setQuantity(remaining)}
                      />
                      {Number.isFinite(buildable) && (
                        <QuickChip
                          label={t('Floor can build')}
                          value={buildable}
                          tone={buildable + EPS < remaining ? 'warn' : 'ok'}
                          onClick={() =>
                            setQuantity(
                              Math.min(buildable, remaining) || buildable
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                  {remaining <= EPS && (
                    <div className='flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm'>
                      <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-600' />
                      <span className='min-w-0 flex-1'>
                        {t('Everything planned on this order has been made.')}{' '}
                        <span className='text-muted-foreground'>
                          {settings?.allowOverProduction
                            ? t('Over-production is allowed by your settings.')
                            : t('Complete the order from its page.')}
                        </span>
                      </span>
                      <Button
                        asChild
                        size='sm'
                        variant='outline'
                        className='h-8'
                      >
                        <Link to={orderPath(order) as never}>
                          {t('Open')} {order.orderNumber}
                        </Link>
                      </Button>
                    </div>
                  )}
                  {overPlan && remaining > EPS && (
                    <p className='text-xs text-amber-700 dark:text-amber-400'>
                      {settings?.allowOverProduction
                        ? t('More than planned — allowed by your settings.')
                        : `${t('Only')} ${fmtQty(remaining)} ${getUnitLabel(order.unit)} ${t('left to make on this order.')}`}
                    </p>
                  )}
                  <MaterialCheck
                    lines={lines}
                    orderId={order.id}
                    quantity={quantity}
                  />
                  <ReceiptPackingUsed r={receipt} />
                </section>

                {/* 3. Quality */}
                <section className='bg-card space-y-4 rounded-xl border p-4'>
                  <SectionTitle n={3} title={t('Quality')} />
                  <div
                    role='radiogroup'
                    aria-label={t('Where the units go')}
                    className='grid grid-cols-1 gap-2 sm:grid-cols-2'
                  >
                    <ModeCard
                      on={mode === 'direct'}
                      disabled={directBlocked}
                      onClick={() => setQcMode('direct')}
                      icon={PackageCheck}
                      title={t('Receive directly')}
                      text={
                        directBlocked
                          ? t(
                              'QC is required — only an inspector can receive past it.'
                            )
                          : t(
                              'Checked on receipt — good units go straight to finished stock.'
                            )
                      }
                      badge={
                        qcRequired && !directBlocked
                          ? t('Inspector')
                          : undefined
                      }
                    />
                    <ModeCard
                      on={mode === 'hold'}
                      onClick={() => setQcMode('hold')}
                      icon={ClipboardCheck}
                      title={t('Send to QC')}
                      text={t(
                        'Units wait in the QC hold — finished stock goes up when they pass inspection.'
                      )}
                      badge={qcRequired ? t('Required by settings') : undefined}
                    />
                  </div>
                  {mode === 'direct' && quantity > 0 && (
                    <>
                      <QualityDecision
                        total={quantity}
                        unit={order.unit}
                        value={{ ...quality, good }}
                        onChange={setQuality}
                      />
                      <FinishedGoodsFields
                        order={order}
                        quantity={good}
                        value={fg}
                        onChange={setFg}
                      />
                    </>
                  )}
                </section>

                <section className='bg-card space-y-2 rounded-xl border p-4'>
                  <Label htmlFor='receipt-notes'>{t('Notes')}</Label>
                  <Textarea
                    id='receipt-notes'
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('Shift, line, batch remarks…')}
                  />
                </section>
              </>
            )}
          </div>

          {/* Summary */}
          <aside className='lg:sticky lg:top-4 lg:self-start'>
            <div className='bg-card space-y-4 rounded-xl border p-4'>
              <div className='text-sm font-semibold'>
                {t('Receipt summary')}
              </div>
              <dl className='space-y-2 text-sm'>
                <SummaryRow
                  label={t('Made')}
                  value={
                    order
                      ? `${fmtQty(quantity)} ${getUnitLabel(order.unit)}`
                      : '—'
                  }
                  strong
                />
                {mode === 'direct' ? (
                  <>
                    <SummaryRow
                      label={t('To finished stock')}
                      value={order ? fmtQty(good) : '—'}
                      tone='ok'
                    />
                    <SummaryRow
                      label={
                        quality.disposition === 'rework'
                          ? t('Rejected → rework')
                          : t('Rejected → scrap')
                      }
                      value={order ? fmtQty(rejected) : '—'}
                      tone={rejected > EPS ? 'bad' : undefined}
                    />
                  </>
                ) : (
                  <SummaryRow
                    label={t('To the QC hold')}
                    value={order ? fmtQty(quantity) : '—'}
                    tone='info'
                  />
                )}
                <SummaryRow
                  label={t('Material used (at cost)')}
                  value={order ? formatMoney(materialCost) : '—'}
                />
                {order && quantity > 0 && (
                  <SummaryRow
                    label={t('Cost per unit')}
                    value={formatMoney(materialCost / quantity)}
                  />
                )}
              </dl>
              {order && (
                <ProgressAfter
                  order={order}
                  quantity={quantity}
                  good={mode === 'direct' ? good : 0}
                />
              )}
              {problems.length > 0 && order && (
                <ul className='space-y-1 text-xs text-rose-700 dark:text-rose-400'>
                  {problems.map((p) => (
                    <li key={p} className='flex gap-1.5'>
                      <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              <div className='flex flex-col gap-2'>
                <Button
                  onClick={() => void submit()}
                  disabled={!!problems.length || posting}
                  className='w-full justify-between'
                >
                  <span className='flex items-center gap-1.5'>
                    {posting ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : mode === 'direct' ? (
                      <PackageCheck className='h-4 w-4' />
                    ) : (
                      <ClipboardCheck className='h-4 w-4' />
                    )}
                    {mode === 'direct'
                      ? t('Receive into stock')
                      : t('Send to QC')}
                  </span>
                  <kbd className='text-[10px] opacity-70'>Ctrl+Enter</kbd>
                </Button>
                <Button
                  variant='ghost'
                  onClick={() => navigate({ to: back.to as never })}
                >
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {inspecting && posted && order && (
        <InspectOutputDialog
          order={order}
          output={posted}
          onClose={() => {
            setInspecting(false)
            navigate({
              to: orderPath(order) as never,
              search: { tab: 'quality' } as never,
            })
          }}
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
}: {
  output: ProductionOutput
  order: ProductionOrder
  canInspect: boolean
  onInspect: () => void
  onMore: () => void
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
          {t('Receive more')}
        </Button>
        <Button asChild variant='outline'>
          <Link to={orderPath(order) as never}>
            {t('Back to')} {order.orderNumber}
          </Link>
        </Button>
      </div>
    </div>
  )
}
