import type { TaxLine } from '@/stores/taxCalculator.api'

/**
 * Shared tax-breakdown rendering for plain-HTML print templates (thermal/A4 invoice and
 * purchase receipts) — mirrors the on-screen `TaxBreakdownSummary` component's collapsing
 * rule (a single flat row for the common single-category/single-rate case, expanding into
 * per-category/per-component rows only when there's actually more than one to show), so
 * printed output matches what the Summary card displayed. `renderRow` supplies the
 * markup for one line — different per template (a thermal `<div>` pair vs. an A4 `<tr>`).
 */
export function buildTaxBreakdownHtml(
  taxLines: TaxLine[] | undefined | null,
  tax: number,
  fallbackLabel: string,
  renderRow: (label: string, amount: number, indent?: boolean) => string
): string {
  if (!tax || tax <= 0) return ''

  if (!taxLines || taxLines.length === 0) {
    return renderRow(fallbackLabel, tax)
  }

  const totalComponents = taxLines.reduce((sum, line) => sum + (line.components?.length || 0), 0)
  if (taxLines.length === 1 && totalComponents <= 1) {
    const line = taxLines[0]
    const component = line.components?.[0]
    const label =
      component?.ratePercent != null
        ? `${line.taxCategoryName || fallbackLabel} (${component.ratePercent}%)`
        : line.taxCategoryName || fallbackLabel
    return renderRow(label, tax)
  }

  return taxLines
    .map((line) => {
      let html = renderRow(line.taxCategoryName || fallbackLabel, line.taxAmount)
      if ((line.components?.length || 0) > 1) {
        html += line.components
          .map((component) =>
            renderRow(`${component.name}${component.ratePercent != null ? ` (${component.ratePercent}%)` : ''}`, component.amount, true)
          )
          .join('')
      }
      return html
    })
    .join('')
}
