import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrencySymbolPrefix } from '@/lib/format-money'

interface MarkupPercentInputProps {
  cost: number
  price: number
  onPriceChange: (price: number) => void
  className?: string
  /** Narrow layout for tight table cells (variant grid) — just the % input, no amount field. */
  compact?: boolean
}

// Native number-input spin buttons make a percent/amount field look like a stray
// stepper rather than a labeled input — hidden the same way a search/currency-prefixed
// input elsewhere in this app would.
const noSpinner = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/**
 * Three-way "Sale Price ⇄ Margin %" ⇄ "Margin amount" calculator that sits below
 * Purchase/Sale Price: Price = Cost × (1 + %/100) = Cost + amount. Editing either
 * margin input here recomputes Price (via onPriceChange); editing Price elsewhere (or
 * Cost changing) recomputes both margin inputs for reference. Neither margin input's
 * own value is itself persisted — only the Price it computes is.
 *
 * Each input tracks its own "currently editing" ref so the sync effect (driven by
 * [cost, price]) never overwrites an in-progress keystroke in that same field with a
 * round-tripped value (e.g. "3" while typing "30"), while still freely refreshing
 * whichever margin field the user ISN'T currently typing in.
 */
export function MarkupPercentInput({ cost, price, onPriceChange, className, compact }: MarkupPercentInputProps) {
  const [pct, setPct] = useState('')
  const [amount, setAmount] = useState('')
  const editingPctRef = useRef(false)
  const editingAmountRef = useRef(false)
  const currencyPrefix = useCurrencySymbolPrefix().trim()

  // Sale Price defaults to 0 until the user actually sets one — computing a margin
  // against that (e.g. "-100%" the instant Purchase Price alone is typed) is
  // technically correct but reads as an alarming, unhelpful bug. Both margin fields
  // stay blank until there's a real price on both sides.
  useEffect(() => {
    const ready = cost > 0 && price > 0
    if (!editingPctRef.current) {
      const computed = ready ? ((price - cost) / cost) * 100 : NaN
      setPct(ready && Number.isFinite(computed) ? (Math.round(computed * 100) / 100).toString() : '')
    }
    if (!editingAmountRef.current) {
      const computed = ready ? price - cost : NaN
      setAmount(ready && Number.isFinite(computed) ? (Math.round(computed * 100) / 100).toString() : '')
    }
  }, [cost, price])

  const handlePctChange = (raw: string) => {
    setPct(raw)
    editingPctRef.current = true
    if (!cost || cost <= 0) return
    const num = parseFloat(raw)
    if (Number.isNaN(num)) return
    onPriceChange(Math.round(cost * (1 + num / 100) * 100) / 100)
  }

  const handleAmountChange = (raw: string) => {
    setAmount(raw)
    editingAmountRef.current = true
    if (!cost || cost <= 0) return
    const num = parseFloat(raw)
    if (Number.isNaN(num)) return
    onPriceChange(Math.round((cost + num) * 100) / 100)
  }

  const pctInput = (
    <Input
      type='number'
      step='0.1'
      placeholder={cost > 0 ? (compact ? 'Margin %' : '30') : '—'}
      disabled={!cost || cost <= 0}
      value={pct}
      showVoiceInput={false}
      onChange={(e) => handlePctChange(e.target.value)}
      onBlur={() => { editingPctRef.current = false }}
      className={cn('h-8 text-xs', noSpinner, compact ? 'w-full' : 'w-full pl-7')}
    />
  )

  if (compact) {
    return <div className={className}>{pctInput}</div>
  }

  const amountInput = (
    <Input
      type='number'
      step='1'
      placeholder={cost > 0 ? '0' : '—'}
      disabled={!cost || cost <= 0}
      value={amount}
      showVoiceInput={false}
      onChange={(e) => handleAmountChange(e.target.value)}
      onBlur={() => { editingAmountRef.current = false }}
      className={cn('h-8 text-xs', noSpinner, 'w-full pl-9')}
    />
  )

  // Two stacked label → prefixed-input pairs, side by side, mirror the Purchase/Sale
  // Price grid above them instead of a bespoke inline row — so neither can overflow
  // into the other regardless of how narrow the column gets, and either one updates
  // Sale Price automatically.
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      <div className='space-y-1'>
        <label className='text-xs font-medium text-foreground'>Margin %</label>
        <div className='relative'>
          <Percent className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
          {pctInput}
        </div>
      </div>
      <div className='space-y-1'>
        <label className='text-xs font-medium text-foreground'>Margin amount</label>
        <div className='relative'>
          <span className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground'>
            {currencyPrefix}
          </span>
          {amountInput}
        </div>
      </div>
      <p className='text-xs text-muted-foreground sm:col-span-2'>
        {cost > 0 ? 'Either field updates Sale Price automatically.' : 'Set purchase price first.'}
      </p>
    </div>
  )
}
