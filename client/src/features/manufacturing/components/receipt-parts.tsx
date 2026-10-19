import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  Factory,
  Minus,
  PackagePlus,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import type { ProductionOrder } from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmtQty } from '../lib/constants'
import type { consumptionFor } from '../lib/output-math'
import { BatchBadge } from './badges'

const EPS = 1e-6

/*
 * Building blocks of a finished goods receipt — shared by the full receipt page and the
 * "Receive finished goods" dialog on a production order. State lives in
 * lib/use-finished-goods-receipt.
 */

export function OrderStrip({ order }: { order: ProductionOrder }) {
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
        <BatchBadge
          size='sm'
          batchNumber={order.batchNumber || order.orderNumber}
          title={t('Finished-goods batch')}
        />
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

/** The big − [qty] + stepper with the unit beside it. */
export function QuantityStepper({
  value,
  onChange,
  unit,
  autoFocus,
  label,
  invalid,
}: {
  value: number | null
  onChange: (n: number | null) => void
  unit: string
  autoFocus?: boolean
  /** Accessible name of the input (default "Quantity made"). */
  label?: string
  invalid?: boolean
}) {
  const { t } = useLanguage()
  const n = value || 0
  // The typed text is kept as-is so "1." or "0.0" can be typed on the way to a decimal;
  // it is replaced only when the value changes from outside (− / +, quick chips).
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => {
    const typed = text === '' ? null : Number(text)
    if (typed !== value) setText(value === null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div
      className={cn(
        'flex h-12 w-full max-w-xs items-center overflow-hidden rounded-lg border',
        invalid && 'border-destructive'
      )}
    >
      <button
        type='button'
        aria-label={t('One less')}
        onClick={() => onChange(Math.max(0, n - 1))}
        className='hover:bg-muted flex h-full w-11 items-center justify-center border-r'
      >
        <Minus className='h-4 w-4' />
      </button>
      <Input
        aria-label={label || t('Quantity made')}
        aria-invalid={invalid || undefined}
        inputMode='decimal'
        autoFocus={autoFocus}
        showVoiceInput={false}
        value={text}
        placeholder='0'
        onChange={(e) => {
          const raw = e.target.value
            .replace(/[^\d.]/g, '')
            .replace(/(\..*)\./g, '$1')
          setText(raw)
          onChange(raw === '' ? null : Number(raw))
        }}
        className='h-full flex-1 rounded-none border-0 text-center text-xl font-semibold tabular-nums shadow-none focus-visible:ring-0'
      />
      <button
        type='button'
        aria-label={t('One more')}
        onClick={() => onChange(n + 1)}
        className='hover:bg-muted flex h-full w-11 items-center justify-center border-l'
      >
        <Plus className='h-4 w-4' />
      </button>
      <span className='text-muted-foreground bg-muted/50 flex h-full items-center border-l px-3 text-sm'>
        {getUnitLabel(unit)}
      </span>
    </div>
  )
}

export function QuickChip({
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
export function MaterialCheck({
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

export function ModeCard({
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

export function SummaryRow({
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
export function ProgressAfter({
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
