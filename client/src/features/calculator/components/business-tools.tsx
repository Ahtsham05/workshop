import { useState } from 'react'
import { ChevronDown, ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  addTax,
  applyDiscountAmount,
  applyDiscounts,
  breakEven,
  changeByPercent,
  discountBetween,
  marginToMarkup,
  percentChange,
  percentOf,
  planInstallments,
  removeTax,
  solvePricing,
  unitCost,
  whatPercent,
  type InstallmentMethod,
  type PricingField,
} from '../lib/business-math'
import { CalcField, PresetChips, ResetButton, ResultCard, ResultRow, Segmented, ToolIntro } from './tool-kit'
import { formatNumber, formatPercent, num, usePersistentState } from '../lib/tool-helpers'

const toneOf = (value: number | null | undefined) => (value == null ? 'default' : value < 0 ? 'negative' : value > 0 ? 'positive' : 'default')

/* ── Margin & markup ─────────────────────────────────────────────────────── */

const PRICING_DRIVERS: { value: PricingField; label: string; field: string; suffix?: string }[] = [
  { value: 'price', label: 'Sale price', field: 'Selling price' },
  { value: 'margin', label: 'Margin %', field: 'Margin you want', suffix: '%' },
  { value: 'markup', label: 'Markup %', field: 'Markup on cost', suffix: '%' },
  { value: 'profit', label: 'Profit', field: 'Profit per piece' },
]

const TARGETS = [5, 10, 15, 20, 25, 30, 40, 50]

export function MarginMarkupTool() {
  const initial = { cost: '', driver: 'margin' as PricingField, value: '', qty: '', lot: '', extra: '', pieces: '' }
  const [s, setS] = usePersistentState('margin', initial)
  const [showUnit, setShowUnit] = useState(false)
  const cost = num(s.cost)
  const value = num(s.value)
  const qty = num(s.qty)
  const result = cost != null && value != null ? solvePricing(cost, s.driver, value) : null
  const driver = PRICING_DRIVERS.find((d) => d.value === s.driver)!
  const impossible = cost != null && value != null && !result
  const unit = unitCost(num(s.lot) ?? 0, num(s.extra) ?? 0, num(s.pieces) ?? 0)

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>
          Margin is profit as a share of the <b>selling price</b>; markup is profit as a share of the <b>cost</b>. A 25% markup is
          only a 20% margin.
        </ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>

      <CalcField label='Cost price' value={s.cost} onChange={(cost) => setS((p) => ({ ...p, cost }))} autoFocus placeholder='e.g. 4500+350' />

      <div className='space-y-1.5'>
        <p className='text-[11px] font-medium text-muted-foreground'>I know the…</p>
        <Segmented value={s.driver} options={PRICING_DRIVERS} onChange={(d) => setS((p) => ({ ...p, driver: d, value: '' }))} />
      </div>

      <CalcField
        label={driver.field}
        value={s.value}
        suffix={driver.suffix}
        onChange={(v) => setS((p) => ({ ...p, value: v }))}
        active
      />
      {(s.driver === 'margin' || s.driver === 'markup') && (
        <PresetChips values={TARGETS} current={value} onPick={(v) => setS((p) => ({ ...p, value: String(v) }))} />
      )}

      {impossible ? (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive'>A margin must be below 100% — at 100% the price would be infinite.</p>
      ) : (
        <ResultCard>
          <ResultRow label='Selling price' value={result?.price} emphasis />
          <ResultRow label='Profit per piece' value={result?.profit} tone={toneOf(result?.profit)} />
          <ResultRow label='Margin (of price)' value={result?.margin} format={formatPercent} />
          <ResultRow label='Markup (on cost)' value={result?.markup} format={formatPercent} />
        </ResultCard>
      )}

      <CalcField label='Quantity (optional)' value={s.qty} onChange={(q) => setS((p) => ({ ...p, qty: q }))} placeholder='1' />
      {result && qty != null && qty !== 0 && (
        <ResultCard title={`For ${formatNumber(qty, { trim: true })} pieces`}>
          <ResultRow label='Total sale' value={result.price * qty} />
          <ResultRow label='Total cost' value={result.cost * qty} />
          <ResultRow label='Total profit' value={result.profit * qty} tone={toneOf(result.profit)} emphasis />
        </ResultCard>
      )}

      {cost != null && cost > 0 && (
        <ResultCard title='Price at common margins'>
          <div className='grid grid-cols-3 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
            <span>Margin</span>
            <span className='text-center'>Markup</span>
            <span className='text-end'>Price</span>
          </div>
          {TARGETS.map((margin) => {
            const price = solvePricing(cost, 'margin', margin)?.price
            return (
              <button
                key={margin}
                type='button'
                onClick={() => setS((p) => ({ ...p, driver: 'margin', value: String(margin) }))}
                className='grid w-full grid-cols-3 px-3 py-1 text-xs tabular-nums hover:bg-accent'
              >
                <span className='text-start'>{margin}%</span>
                <span className='text-center text-muted-foreground'>{formatPercent(marginToMarkup(margin))}</span>
                <span className='text-end font-semibold'>{price != null ? formatNumber(price) : '—'}</span>
              </button>
            )
          })}
        </ResultCard>
      )}

      <div className='rounded-lg border'>
        <button
          type='button'
          onClick={() => setShowUnit((v) => !v)}
          className='flex w-full items-center justify-between px-3 py-2 text-xs font-medium'
          aria-expanded={showUnit}
        >
          Work out the cost of one piece from a carton
          <ChevronDown className={cn('size-4 transition-transform', showUnit && 'rotate-180')} />
        </button>
        {showUnit && (
          <div className='space-y-2 border-t p-3'>
            <div className='grid grid-cols-2 gap-2'>
              <CalcField label='Carton / lot price' value={s.lot} onChange={(lot) => setS((p) => ({ ...p, lot }))} />
              <CalcField label='Freight & other charges' value={s.extra} onChange={(extra) => setS((p) => ({ ...p, extra }))} />
            </div>
            <CalcField label='Pieces in the carton' value={s.pieces} onChange={(pieces) => setS((p) => ({ ...p, pieces }))} />
            <ResultCard>
              <ResultRow label='Landed cost of the lot' value={unit.totalCost} />
              <ResultRow label='Cost per piece' value={unit.unitCost} emphasis />
            </ResultCard>
            <button
              type='button'
              disabled={unit.unitCost == null}
              onClick={() => unit.unitCost != null && setS((p) => ({ ...p, cost: String(unit.unitCost) }))}
              className='w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
            >
              Use as cost price
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Discount ────────────────────────────────────────────────────────────── */

type DiscountMode = 'percent' | 'amount' | 'find'

export function DiscountTool() {
  const initial = { mode: 'percent' as DiscountMode, price: '', pct: '', extra: '', amount: '', paid: '', cost: '' }
  const [s, setS] = usePersistentState('discount', initial)
  const price = num(s.price)
  const cost = num(s.cost)

  let result = null as ReturnType<typeof applyDiscounts> | null
  if (price != null) {
    if (s.mode === 'percent') {
      const steps = [num(s.pct), num(s.extra)].filter((v): v is number => v != null && v !== 0)
      if (num(s.pct) != null) result = applyDiscounts(price, steps)
    } else if (s.mode === 'amount') {
      const amount = num(s.amount)
      if (amount != null) result = applyDiscountAmount(price, amount)
    } else {
      const paid = num(s.paid)
      if (paid != null) result = discountBetween(price, paid)
    }
  }
  const profitAfter = result && cost != null ? result.final - cost : null

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>Discounts, chained discounts, and what a discount does to your profit.</ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>
      <Segmented
        value={s.mode}
        onChange={(mode) => setS((p) => ({ ...p, mode }))}
        options={[
          { value: 'percent', label: '% off' },
          { value: 'amount', label: 'Amount off' },
          { value: 'find', label: 'Find the %' },
        ]}
      />
      <CalcField label='Original price' value={s.price} onChange={(v) => setS((p) => ({ ...p, price: v }))} autoFocus />

      {s.mode === 'percent' && (
        <>
          <div className='grid grid-cols-2 gap-2'>
            <CalcField label='Discount' suffix='%' value={s.pct} onChange={(v) => setS((p) => ({ ...p, pct: v }))} active />
            <CalcField label='Then a further' suffix='%' value={s.extra} onChange={(v) => setS((p) => ({ ...p, extra: v }))} placeholder='optional' />
          </div>
          <PresetChips values={[5, 10, 15, 20, 25, 30, 50]} current={num(s.pct)} onPick={(v) => setS((p) => ({ ...p, pct: String(v) }))} />
        </>
      )}
      {s.mode === 'amount' && <CalcField label='Amount off' value={s.amount} onChange={(v) => setS((p) => ({ ...p, amount: v }))} active />}
      {s.mode === 'find' && <CalcField label='Price after discount' value={s.paid} onChange={(v) => setS((p) => ({ ...p, paid: v }))} active />}

      <ResultCard>
        <ResultRow label='Price after discount' value={result?.final} emphasis />
        <ResultRow label='Customer saves' value={result?.saved} />
        <ResultRow
          label='Total discount'
          value={result?.percent}
          format={formatPercent}
          note={s.mode === 'percent' && num(s.extra) ? 'Chained discounts are not simply added together' : undefined}
        />
      </ResultCard>

      <CalcField label='Your cost (optional)' value={s.cost} onChange={(v) => setS((p) => ({ ...p, cost: v }))} hint='Shows whether the discount still leaves you a profit' />
      {result && cost != null && (
        <ResultCard title='Your profit'>
          <ResultRow label='Profit before discount' value={result.original - cost} tone={toneOf(result.original - cost)} />
          <ResultRow label='Profit after discount' value={profitAfter} tone={toneOf(profitAfter)} emphasis />
          <ResultRow label='Margin after discount' value={result.final ? ((profitAfter ?? 0) / result.final) * 100 : null} format={formatPercent} />
        </ResultCard>
      )}
    </div>
  )
}

/* ── Tax ─────────────────────────────────────────────────────────────────── */

export function TaxTool() {
  const initial = { mode: 'add' as 'add' | 'remove', amount: '', rate: '18' }
  const [s, setS] = usePersistentState('tax', initial)
  const amount = num(s.amount)
  const rate = num(s.rate)
  const result = amount != null && rate != null ? (s.mode === 'add' ? addTax(amount, rate) : removeTax(amount, rate)) : null

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>GST / VAT / sales tax — add it to a price, or take it out of a price that already includes it.</ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>
      <Segmented
        value={s.mode}
        onChange={(mode) => setS((p) => ({ ...p, mode }))}
        options={[
          { value: 'add', label: 'Add tax' },
          { value: 'remove', label: 'Remove tax (inclusive)' },
        ]}
      />
      <CalcField
        label={s.mode === 'add' ? 'Price before tax' : 'Price including tax'}
        value={s.amount}
        onChange={(v) => setS((p) => ({ ...p, amount: v }))}
        autoFocus
        active
      />
      <CalcField label='Tax rate' suffix='%' value={s.rate} onChange={(v) => setS((p) => ({ ...p, rate: v }))} />
      <PresetChips values={[5, 10, 13, 15, 16, 17, 18, 20]} current={rate} onPick={(v) => setS((p) => ({ ...p, rate: String(v) }))} />
      <ResultCard>
        <ResultRow label='Before tax' value={result?.net} emphasis={s.mode === 'remove'} />
        <ResultRow label={`Tax${rate != null ? ` @ ${formatPercent(rate)}` : ''}`} value={result?.tax} />
        <ResultRow label='Including tax' value={result?.gross} emphasis={s.mode === 'add'} />
      </ResultCard>
    </div>
  )
}

/* ── Percentages ─────────────────────────────────────────────────────────── */

function PercentLine({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='space-y-2 rounded-lg border p-2.5'>
      <p className='text-xs font-semibold'>{title}</p>
      {children}
    </div>
  )
}

export function PercentTool() {
  const initial = { aPct: '', aBase: '', bPart: '', bWhole: '', cFrom: '', cTo: '', dBase: '', dPct: '' }
  const [s, setS] = usePersistentState('percent', initial)
  const set = (key: keyof typeof initial) => (value: string) => setS((p) => ({ ...p, [key]: value }))

  const a = num(s.aPct) != null && num(s.aBase) != null ? percentOf(num(s.aPct)!, num(s.aBase)!) : null
  const b = num(s.bPart) != null && num(s.bWhole) != null ? whatPercent(num(s.bPart)!, num(s.bWhole)!) : null
  const c = num(s.cFrom) != null && num(s.cTo) != null ? percentChange(num(s.cFrom)!, num(s.cTo)!) : null
  const dUp = num(s.dBase) != null && num(s.dPct) != null ? changeByPercent(num(s.dBase)!, num(s.dPct)!) : null
  const dDown = num(s.dBase) != null && num(s.dPct) != null ? changeByPercent(num(s.dBase)!, -num(s.dPct)!) : null

  // Four question cards make this the tallest tool, so it is spaced a little tighter to fit
  // a typical laptop / 1080p screen without scrolling.
  return (
    <div className='space-y-2'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>Four everyday percentage questions.</ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>
      <PercentLine title='What is X% of Y?'>
        <div className='grid grid-cols-2 gap-2'>
          <CalcField label='Percent' suffix='%' value={s.aPct} onChange={set('aPct')} autoFocus />
          <CalcField label='of' value={s.aBase} onChange={set('aBase')} />
        </div>
        <ResultCard>
          <ResultRow label='Answer' value={a} emphasis />
        </ResultCard>
      </PercentLine>
      <PercentLine title='X is what % of Y?'>
        <div className='grid grid-cols-2 gap-2'>
          <CalcField label='Part' value={s.bPart} onChange={set('bPart')} />
          <CalcField label='of the whole' value={s.bWhole} onChange={set('bWhole')} />
        </div>
        <ResultCard>
          <ResultRow label='Share' value={b} format={formatPercent} emphasis />
        </ResultCard>
      </PercentLine>
      <PercentLine title='% change from X to Y (growth / drop)'>
        <div className='grid grid-cols-2 gap-2'>
          <CalcField label='From (old)' value={s.cFrom} onChange={set('cFrom')} />
          <CalcField label='To (new)' value={s.cTo} onChange={set('cTo')} />
        </div>
        <ResultCard>
          <ResultRow label={c != null && c < 0 ? 'Decrease' : 'Increase'} value={c} format={formatPercent} tone={toneOf(c)} emphasis />
          <ResultRow label='Difference' value={num(s.cFrom) != null && num(s.cTo) != null ? num(s.cTo)! - num(s.cFrom)! : null} />
        </ResultCard>
      </PercentLine>
      <PercentLine title='Increase or decrease X by Y%'>
        <div className='grid grid-cols-2 gap-2'>
          <CalcField label='Amount' value={s.dBase} onChange={set('dBase')} />
          <CalcField label='by' suffix='%' value={s.dPct} onChange={set('dPct')} />
        </div>
        <ResultCard>
          <ResultRow label='Increased' value={dUp} />
          <ResultRow label='Decreased' value={dDown} />
        </ResultCard>
      </PercentLine>
    </div>
  )
}

/* ── Installments ────────────────────────────────────────────────────────── */

export function InstallmentTool() {
  const initial = { price: '', advance: '', months: '12', rate: '', method: 'flat' as InstallmentMethod }
  const [s, setS] = usePersistentState('installment', initial)
  const [showSchedule, setShowSchedule] = useState(false)
  const price = num(s.price)
  const months = num(s.months)
  const plan =
    price != null && months != null
      ? planInstallments({ price, advance: num(s.advance) ?? 0, months, rate: num(s.rate) ?? 0, method: s.method })
      : null
  const advanceTooBig = price != null && (num(s.advance) ?? 0) > price

  const copyPlan = () => {
    if (!plan || price == null) return
    const lines = [
      `Cash price: ${formatNumber(price)}`,
      `Advance: ${formatNumber(num(s.advance) ?? 0)}`,
      `Monthly installment: ${formatNumber(plan.monthly)} × ${Math.floor(months!)} months`,
      `Total payable: ${formatNumber(plan.totalPayable)}`,
    ]
    void navigator.clipboard?.writeText(lines.join('\n')).then(
      () => toast.success('Plan copied — paste it into WhatsApp or SMS'),
      () => toast.error('Could not copy to the clipboard')
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>Quote an easy-installment plan: advance, monthly amount and the total the customer pays.</ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>
      <CalcField label='Cash price' value={s.price} onChange={(v) => setS((p) => ({ ...p, price: v }))} autoFocus />
      <CalcField label='Advance / down payment' value={s.advance} onChange={(v) => setS((p) => ({ ...p, advance: v }))} placeholder='0' />
      {price != null && price > 0 && (
        <PresetChips
          values={[10, 20, 25, 30, 40, 50]}
          onPick={(pct) => setS((p) => ({ ...p, advance: String(percentOf(pct, price)) }))}
        />
      )}
      {advanceTooBig && <p className='text-[11px] text-destructive'>The advance is more than the price.</p>}
      <div className='grid grid-cols-2 gap-2'>
        <CalcField label='Months' value={s.months} onChange={(v) => setS((p) => ({ ...p, months: v }))} />
        <CalcField
          label={s.method === 'flat' ? 'Markup (whole plan)' : 'Yearly interest'}
          suffix='%'
          value={s.rate}
          onChange={(v) => setS((p) => ({ ...p, rate: v }))}
          placeholder='0'
        />
      </div>
      <PresetChips suffix=' mo' values={[3, 6, 9, 12, 18, 24]} current={months} onPick={(v) => setS((p) => ({ ...p, months: String(v) }))} />
      <Segmented
        value={s.method}
        onChange={(method) => setS((p) => ({ ...p, method }))}
        options={[
          { value: 'flat', label: 'Flat markup' },
          { value: 'reducing', label: 'Reducing balance' },
        ]}
      />
      <ResultCard>
        <ResultRow label='Monthly installment' value={plan?.monthly} emphasis />
        <ResultRow label='Amount financed' value={plan?.financed} />
        <ResultRow label='Your profit on the plan' value={plan?.totalProfit} tone={toneOf(plan?.totalProfit)} />
        <ResultRow label='Total the customer pays' value={plan?.totalPayable} />
        <ResultRow label='Over the cash price' value={plan?.effectiveIncrease} format={formatPercent} />
      </ResultCard>
      {plan && (
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => setShowSchedule((v) => !v)}
            className='flex-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent'
            aria-expanded={showSchedule}
          >
            {showSchedule ? 'Hide' : 'Show'} schedule
          </button>
          <button
            type='button'
            onClick={copyPlan}
            className='flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90'
          >
            <ClipboardCopy className='size-3.5' /> Copy plan
          </button>
        </div>
      )}
      {plan && showSchedule && (
        <div className='overflow-hidden rounded-lg border'>
          <table className='w-full text-[11px] tabular-nums'>
            <thead className='bg-muted/60 text-muted-foreground'>
              <tr>
                <th className='px-2 py-1 text-start font-semibold'>#</th>
                <th className='px-2 py-1 text-end font-semibold'>Payment</th>
                <th className='px-2 py-1 text-end font-semibold'>Profit</th>
                <th className='px-2 py-1 text-end font-semibold'>Balance</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {plan.schedule.map((row) => (
                <tr key={row.month}>
                  <td className='px-2 py-1'>{row.month}</td>
                  <td className='px-2 py-1 text-end'>{formatNumber(row.payment)}</td>
                  <td className='px-2 py-1 text-end text-muted-foreground'>{formatNumber(row.profit)}</td>
                  <td className='px-2 py-1 text-end'>{formatNumber(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Break-even ──────────────────────────────────────────────────────────── */

export function BreakEvenTool() {
  const initial = { fixed: '', price: '', variable: '', target: '' }
  const [s, setS] = usePersistentState('breakeven', initial)
  const fixed = num(s.fixed)
  const price = num(s.price)
  const variable = num(s.variable)
  const target = num(s.target) ?? 0
  const result = fixed != null && price != null && variable != null ? breakEven(fixed, price, variable) : null
  const withTarget = result && target > 0 ? breakEven(fixed!, price!, variable!, target) : null

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-2'>
        <ToolIntro>How many you must sell before the month's fixed costs (rent, salaries, bills) are covered.</ToolIntro>
        <ResetButton onClick={() => setS(initial)} />
      </div>
      <CalcField
        label='Fixed costs for the period'
        value={s.fixed}
        onChange={(v) => setS((p) => ({ ...p, fixed: v }))}
        autoFocus
        placeholder='e.g. 80000+45000+12000'
        hint='Rent + salaries + bills — add them right in the box'
      />
      <div className='grid grid-cols-2 gap-2'>
        <CalcField label='Selling price / unit' value={s.price} onChange={(v) => setS((p) => ({ ...p, price: v }))} />
        <CalcField label='Cost / unit' value={s.variable} onChange={(v) => setS((p) => ({ ...p, variable: v }))} />
      </div>
      {result && result.units == null ? (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          Each sale loses money (price is not above cost), so fixed costs can never be covered.
        </p>
      ) : (
        <ResultCard>
          <ResultRow label='Units to break even' value={result?.units} format={(v) => formatNumber(v, { decimals: 0 })} emphasis />
          <ResultRow label='Sales to break even' value={result?.revenue} />
          <ResultRow label='Profit per unit' value={result?.contribution} tone={toneOf(result?.contribution)} />
          <ResultRow label='Contribution margin' value={result?.contributionRatio} format={formatPercent} />
        </ResultCard>
      )}
      <CalcField label='Profit you want to make (optional)' value={s.target} onChange={(v) => setS((p) => ({ ...p, target: v }))} />
      {withTarget?.units != null && (
        <ResultCard title={`To make ${formatNumber(target)} profit`}>
          <ResultRow label='Units to sell' value={withTarget.units} format={(v) => formatNumber(v, { decimals: 0 })} emphasis />
          <ResultRow label='Sales needed' value={withTarget.revenue} />
        </ResultCard>
      )}
    </div>
  )
}
