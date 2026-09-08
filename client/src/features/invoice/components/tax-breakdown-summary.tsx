import { cn } from '@/lib/utils'
import { useFormatMoney } from '@/lib/format-money'
import type { TaxLine } from '@/stores/taxCalculator.api'

interface TaxBreakdownSummaryProps {
  /** Per-category tax breakdown — mirrors server buildTaxLineSchema(). */
  taxLines: TaxLine[]
  totalTax: number
  /** Denser spacing/smaller text for print/receipt contexts. */
  compact?: boolean
}

/**
 * Renders the server-computed tax breakdown wherever an invoice/purchase shows its tax
 * line — Summary card, invoice-list detail, or a print template. Deliberately collapses
 * to a single flat line for the common single-category/single-rate case (identical to what
 * used to be a manually-entered "Tax (8%)" row) so simple VAT/GST invoices stay just as
 * uncluttered as before; only expands into a per-category/per-component breakdown once
 * there's actually more than one tax component to show (e.g. US state+county+city stacking).
 */
export function TaxBreakdownSummary({ taxLines, totalTax, compact }: TaxBreakdownSummaryProps) {
  const formatMoney = useFormatMoney()

  if (!taxLines || taxLines.length === 0 || totalTax === 0) return null

  const totalComponentCount = taxLines.reduce((sum, line) => sum + (line.components?.length || 0), 0)
  const isSimpleCase = taxLines.length === 1 && totalComponentCount <= 1

  if (isSimpleCase) {
    const line = taxLines[0]
    const component = line.components?.[0]
    const label = component?.ratePercent != null ? `${line.taxCategoryName || 'Tax'} (${component.ratePercent}%)` : line.taxCategoryName || 'Tax'
    return (
      <div className={cn('flex justify-between gap-6', compact && 'text-xs')}>
        <span className='text-muted-foreground'>{label}</span>
        <span className='tabular-nums'>{formatMoney(totalTax)}</span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-1', compact && 'text-xs')}>
      {taxLines.map((line) => (
        <div key={line.taxCategoryId || line.taxCategoryName}>
          <div className='flex justify-between gap-6'>
            <span className='text-muted-foreground'>{line.taxCategoryName || 'Tax'}</span>
            <span className='tabular-nums'>{formatMoney(line.taxAmount)}</span>
          </div>
          {(line.components?.length || 0) > 1 &&
            line.components.map((component) => (
              <div key={component.taxRateId} className='flex justify-between gap-6 pl-3 text-muted-foreground'>
                <span>
                  {component.name}
                  {component.ratePercent != null ? ` (${component.ratePercent}%)` : ''}
                </span>
                <span className='tabular-nums'>{formatMoney(component.amount)}</span>
              </div>
            ))}
        </div>
      ))}
      <div className='flex justify-between gap-6 font-medium'>
        <span>Total Tax</span>
        <span className='tabular-nums'>{formatMoney(totalTax)}</span>
      </div>
    </div>
  )
}
