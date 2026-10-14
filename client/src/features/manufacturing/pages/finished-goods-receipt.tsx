import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Loader2,
  Minus,
  PackageCheck,
  PackagePlus,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetManufacturingSettingsQuery,
  useGetProductionOrderQuery,
  useGetProductionOrdersQuery,
  useReportOutputMutation,
  type FinishedGoodsInput,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  FinishedGoodsFields,
  InspectOutputDialog,
} from '../components/execution-dialogs'
import { PageHeader } from '../components/page'
import {
  QualityDecision,
  type QualityValue,
} from '../components/quality-decision'
import { fmtQty, orderPath } from '../lib/constants'
import { buildableFrom, cleanFg, consumptionFor } from '../lib/output-math'

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
  const { hasPermission } = usePermissions()
  const canInspect = hasPermission('inspectProduction')
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
  const { data: settings } = useGetManufacturingSettingsQuery()
  const [reportOutput, { isLoading: posting }] = useReportOutputMutation()

  const qcRequired = settings?.requireQualityCheck ?? true
  const [qcMode, setQcMode] = useState<'hold' | 'direct' | null>(null)
  const mode: 'hold' | 'direct' = qcMode ?? (qcRequired ? 'hold' : 'direct')
  const directBlocked = qcRequired && !canInspect

  const [qty, setQty] = useState<number | null>(null)
  const [quality, setQuality] = useState<QualityValue>({
    good: 0,
    disposition: 'scrap',
    reason: '',
  })
  const [fg, setFg] = useState<FinishedGoodsInput>({})
  const [notes, setNotes] = useState('')
  const [posted, setPosted] = useState<ProductionOutput | null>(null)
  const [inspecting, setInspecting] = useState(false)

  const remaining = order
    ? Math.max(0, order.plannedQuantity - order.producedQuantity)
    : 0
  const buildable = order ? buildableFrom(order) : 0
  const canMake = Math.min(remaining, buildable)

  // A newly chosen order starts at what the floor can build (capped at what is left).
  useEffect(() => {
    if (!order) return
    const start = canMake > 0 ? canMake : null
    setQty(start)
    setQuality((q) => ({ ...q, good: start || 0 }))
    setFg({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  const quantity = qty || 0
  const lines = useMemo(
    () => (order ? consumptionFor(order, quantity) : []),
    [order, quantity]
  )
  const shortLines = lines.filter((l) => l.short > EPS)
  const materialCost = lines.reduce((s, l) => s + l.cost, 0)
  const overPlan = !!order && quantity > remaining + EPS
  const good = Math.min(quality.good, quantity)
  const rejected = Math.max(0, quantity - good)

  const setQuantity = (n: number | null) => {
    setQty(n)
    // Keep "all passed" in step with the quantity unless rejects were entered.
    setQuality((q) => ({
      ...q,
      good: q.good >= quantity - EPS ? n || 0 : Math.min(q.good, n || 0),
    }))
  }

  const problems = [
    !order && t('Choose the production order'),
    order && !(quantity > 0) && t('Enter how many were made'),
    shortLines.length > 0 &&
      t('Not enough material on the floor for this quantity'),
    overPlan &&
      !settings?.allowOverProduction &&
      t('More than the order still has to make'),
    mode === 'direct' && directBlocked && t('You can’t receive past QC'),
  ].filter(Boolean) as string[]

  const submit = async () => {
    if (!order || problems.length || posting) return
    try {
      const out = await reportOutput({
        orderId: order.id,
        producedQuantity: quantity,
        qcMode: mode,
        ...(mode === 'direct'
          ? {
              goodQuantity: good,
              rejectDisposition: quality.disposition,
              rejectReason: rejected > EPS ? quality.reason : undefined,
              finishedGoods: cleanFg(fg),
            }
          : {}),
        notes,
      }).unwrap()
      setPosted(out)
      toast.success(
        mode === 'direct'
          ? `${out.outputNumber} · ${fmtQty(out.goodQuantity)} ${t('to finished stock')}`
          : `${out.outputNumber} · ${fmtQty(out.producedQuantity)} ${t('sent to QC')}`
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not post the receipt')))
    }
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
            setNotes('')
            setQcMode(null)
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
                    <div className='flex h-12 w-full max-w-xs items-center overflow-hidden rounded-lg border'>
                      <button
                        type='button'
                        aria-label={t('One less')}
                        onClick={() => setQuantity(Math.max(0, quantity - 1))}
                        className='hover:bg-muted flex h-full w-11 items-center justify-center border-r'
                      >
                        <Minus className='h-4 w-4' />
                      </button>
                      <Input
                        aria-label={t('Quantity made')}
                        inputMode='decimal'
                        autoFocus
                        showVoiceInput={false}
                        value={qty === null ? '' : String(qty)}
                        placeholder='0'
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d.]/g, '')
                          setQuantity(raw === '' ? null : Number(raw))
                        }}
                        className='h-full flex-1 rounded-none border-0 text-center text-xl font-semibold tabular-nums shadow-none focus-visible:ring-0'
                      />
                      <button
                        type='button'
                        aria-label={t('One more')}
                        onClick={() => setQuantity(quantity + 1)}
                        className='hover:bg-muted flex h-full w-11 items-center justify-center border-l'
                      >
                        <Plus className='h-4 w-4' />
                      </button>
                      <span className='text-muted-foreground bg-muted/50 flex h-full items-center border-l px-3 text-sm'>
                        {getUnitLabel(order.unit)}
                      </span>
                    </div>
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
                      on={mode === 'hold'}
                      onClick={() => setQcMode('hold')}
                      icon={ClipboardCheck}
                      title={t('Send to QC')}
                      text={t(
                        'Units wait in the QC hold — finished stock goes up when they pass inspection.'
                      )}
                      badge={qcRequired ? t('Required by settings') : undefined}
                    />
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
                  onClick={submit}
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

function OrderStrip({ order }: { order: ProductionOrder }) {
  const { t } = useLanguage()
  const facts: [string, string, string?][] = [
    [t('Planned'), fmtQty(order.plannedQuantity)],
    [t('Made'), fmtQty(order.producedQuantity)],
    [t('Good'), fmtQty(order.completedQuantity), 'ok'],
    [
      t('In QC'),
      fmtQty(order.qcPendingQuantity),
      order.qcPendingQuantity > 0 ? 'info' : undefined,
    ],
    [
      t('Left to make'),
      fmtQty(Math.max(0, order.plannedQuantity - order.producedQuantity)),
    ],
  ]
  return (
    <div className='bg-muted/30 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-3 py-2.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <Factory className='text-muted-foreground h-4 w-4 shrink-0' />
        <span className='truncate font-semibold'>{order.productName}</span>
        <span className='text-muted-foreground text-xs'>
          {getUnitLabel(order.unit)}
        </span>
      </div>
      {facts.map(([label, value, tone]) => (
        <div key={label}>
          <div className='text-muted-foreground text-[11px]'>{label}</div>
          <div
            className={cn(
              'text-sm font-semibold tabular-nums',
              tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
              tone === 'info' && 'text-sky-600 dark:text-sky-400'
            )}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuickChip({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn'
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='hover:bg-muted flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs'
    >
      {label}
      <b
        className={cn(
          'tabular-nums',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {fmtQty(value)}
      </b>
    </button>
  )
}

/** What this output takes off the floor, line by line — and the shortfall, if any. */
function MaterialCheck({
  lines,
  orderId,
  quantity,
}: {
  lines: ReturnType<typeof consumptionFor>
  orderId: string
  quantity: number
}) {
  const { t } = useLanguage()
  if (!lines.length)
    return (
      <p className='text-muted-foreground text-xs'>
        {t('This order has no BOM materials — nothing is taken off the floor.')}
      </p>
    )
  const short = lines.filter((l) => l.short > EPS)
  return (
    <div className='space-y-2'>
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full min-w-[28rem] text-sm'>
          <thead className='bg-muted/40 text-muted-foreground text-xs'>
            <tr>
              <th className='px-3 py-2 text-left font-medium'>
                {t('Material used')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Needed')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('On the floor')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ material: m, need, inWip, short: s }) => (
              <tr key={m._id} className='border-t'>
                <td className='px-3 py-2'>
                  <span className='font-medium'>{m.productName}</span>
                  {m.isOptional && (
                    <span className='text-muted-foreground ml-1.5 text-xs'>
                      {t('optional')}
                    </span>
                  )}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {fmtQty(need)}{' '}
                  <span className='text-muted-foreground text-xs'>
                    {getUnitLabel(m.unit)}
                  </span>
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {fmtQty(inWip)}
                </td>
                <td className='px-3 py-2 text-right'>
                  {quantity <= 0 ? (
                    <span className='text-muted-foreground'>—</span>
                  ) : s > EPS ? (
                    <Badge
                      variant='outline'
                      className='h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-300'
                    >
                      {t('Short')} {fmtQty(s)}
                    </Badge>
                  ) : (
                    <Badge
                      variant='outline'
                      className='h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300'
                    >
                      {t('OK')}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {short.length > 0 && quantity > 0 && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm'>
          <AlertTriangle className='h-4 w-4 shrink-0 text-rose-600' />
          <span className='min-w-0 flex-1'>
            {t('Not enough on the floor for this quantity:')}{' '}
            {short
              .map((l) => `${l.material.productName} ${fmtQty(l.short)}`)
              .join(', ')}
          </span>
          <Button asChild size='sm' variant='outline' className='h-8'>
            <Link
              to={'/manufacturing/material-issues/new' as never}
              search={{ orderId } as never}
            >
              <PackagePlus className='mr-1.5 h-3.5 w-3.5' />
              {t('Issue the missing material')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

function ModeCard({
  on,
  disabled,
  onClick,
  icon: Icon,
  title,
  text,
  badge,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  icon: typeof ShieldCheck
  title: string
  text: string
  badge?: string
}) {
  return (
    <button
      type='button'
      role='radio'
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on
          ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
          : 'hover:bg-muted/50'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          on
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className='h-4 w-4' />
      </span>
      <span className='min-w-0'>
        <span className='flex flex-wrap items-center gap-1.5 text-sm font-semibold'>
          {title}
          {badge && (
            <Badge
              variant='outline'
              className='h-5 px-1.5 text-[10px] font-normal'
            >
              {badge}
            </Badge>
          )}
        </span>
        <span className='text-muted-foreground block text-xs'>{text}</span>
      </span>
    </button>
  )
}

function SummaryRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'ok' | 'bad' | 'info'
  strong?: boolean
}) {
  return (
    <div className='flex items-baseline justify-between gap-3'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong && 'text-base font-semibold',
          tone === 'ok' && 'font-medium text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'font-medium text-rose-600 dark:text-rose-400',
          tone === 'info' && 'font-medium text-sky-600 dark:text-sky-400'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** The order's progress once this receipt is posted. */
function ProgressAfter({
  order,
  quantity,
  good,
}: {
  order: ProductionOrder
  quantity: number
  good: number
}) {
  const { t } = useLanguage()
  const made = order.producedQuantity + quantity
  const pct = Math.min(100, Math.round((made / order.plannedQuantity) * 100))
  const goodPct = Math.min(
    100,
    Math.round(((order.completedQuantity + good) / order.plannedQuantity) * 100)
  )
  return (
    <div className='space-y-1.5 border-t pt-3'>
      <div className='text-muted-foreground flex justify-between text-xs'>
        <span>{t('Order after this receipt')}</span>
        <span className='tabular-nums'>
          {fmtQty(made)} / {fmtQty(order.plannedQuantity)}
        </span>
      </div>
      <div className='bg-muted relative h-2 overflow-hidden rounded-full'>
        <div
          className='absolute inset-y-0 left-0 bg-sky-500/60'
          style={{ width: `${pct}%` }}
        />
        <div
          className='absolute inset-y-0 left-0 bg-emerald-600'
          style={{ width: `${goodPct}%` }}
        />
      </div>
      <div className='text-muted-foreground flex gap-3 text-[11px]'>
        <span className='flex items-center gap-1'>
          <span className='h-2 w-2 rounded-sm bg-emerald-600' /> {t('Good')}{' '}
          {goodPct}%
        </span>
        <span className='flex items-center gap-1'>
          <span className='h-2 w-2 rounded-sm bg-sky-500/60' /> {t('Made')}{' '}
          {pct}%
        </span>
      </div>
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
