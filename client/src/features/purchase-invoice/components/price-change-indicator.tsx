import type { ReactNode } from 'react'
import { ArrowUp, ArrowDown, Equal, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PriceComparisonEntry } from '@/stores/purchase.api'
import { useCurrencyMeta, useFormatMoney } from '@/lib/format-money'
import { calculatePriceChange, formatPriceChange, resolvePriceComparisonBasis } from '../utils/price-comparison'

const TONE_CLASSES: Record<string, string> = {
  good: 'text-green-600 dark:text-green-400',
  bad: 'text-amber-600 dark:text-amber-400',
  warning: 'text-red-600 dark:text-red-400 font-medium',
  neutral: 'text-muted-foreground',
}

/**
 * Compact "↑ Rs11.17 (+7.51%)" line rendered under a purchase row's Purchase Price field.
 * Nothing is shown when the price is unchanged — only an actual change is worth the space.
 *
 * `floating` (desktop table rows): the line hangs below the input, absolutely positioned
 * inside the row's bottom padding (the caller's wrapper must be `relative`), so it never adds
 * height — the Purchase Price input stays vertically aligned with Qty/Sale Price/Discount in
 * the same row whether or not a change line is showing, and nothing shifts when the
 * comparison arrives.
 *
 * Otherwise (stacked card rows) it always renders its own fixed-height, fixed-margin slot (`mt-1 h-3.5`) — even before the
 * comparison has loaded, and even when there's nothing to show — instead of rendering
 * `null` until data arrives. The comparison is fetched asynchronously (debounced bulk
 * request, see usePurchasePriceComparison), so if this returned `null` while waiting, the
 * Purchase Price input would visibly shift upward a beat later the instant the row grows
 * to fit the newly-appeared text (the table cell centers its content vertically). Reserving
 * the slot up front keeps the input's position stable from the very first paint, and gives
 * a fixed, readable gap between the input and the line below it.
 */
export function PriceChangeIndicator({
  comparison,
  currentPrice,
  supplierName,
  floating = false,
}: {
  comparison: PriceComparisonEntry | undefined
  currentPrice: number
  supplierName?: string
  floating?: boolean
}) {
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  let body: ReactNode = null
  let tone = 'neutral'
  let tooltip: string | undefined

  const basis = resolvePriceComparisonBasis(comparison, supplierName)
  if (comparison && !basis) {
    body = <span className='truncate'>No previous purchase</span>
  } else if (basis) {
    const change = calculatePriceChange(basis.previousPrice, currentPrice)
    if (change && change.direction !== 'none') {
      const formatted = formatPriceChange(change, currencyMeta)
      const Icon =
        formatted.icon === 'up'
          ? change.severity === 'significant'
            ? TriangleAlert
            : ArrowUp
          : formatted.icon === 'down'
            ? ArrowDown
            : Equal
      tone = formatted.tone
      const severityNote =
        change.severity === 'significant' ? (change.direction === 'increase' ? 'Significant increase — ' : 'Notable decrease — ') : ''
      tooltip = `${severityNote}${basis.label} (${formatMoney(basis.previousPrice)})`
      body = (
        <>
          <Icon className='h-2.5 w-2.5 shrink-0' />
          <span className='min-w-0 truncate'>{formatted.text}</span>
        </>
      )
    }
  }

  if (floating && !body) return null

  return (
    <div
      className={cn(
        'flex h-3.5 min-w-0 items-center justify-center gap-1 text-[10px] leading-none',
        // Floating: centred under the input but allowed a little wider than it, so
        // "-Rs180.00 (-15.65%)" isn't cut off by the input's width.
        floating ? 'absolute left-1/2 top-full mt-0.5 w-max max-w-[150px] -translate-x-1/2' : 'mt-1 w-full',
        TONE_CLASSES[tone],
      )}
      title={tooltip}
    >
      {body}
    </div>
  )
}
