import { useSelector } from 'react-redux'
import { useGetBranchQuery, type InvoiceTemplate } from '@/stores/branch.api'
import { RootState } from '@/stores/store'

export type { InvoiceTemplate }

export const INVOICE_TEMPLATE_OPTIONS: Array<{ value: InvoiceTemplate; label: string; description: string }> = [
  { value: 'standard', label: 'Standard', description: 'Spacious layout with a larger header and generous spacing' },
  { value: 'compact', label: 'Compact', description: 'Tight margins and rows — fits the most items per page' },
  { value: 'modern', label: 'Modern', description: 'Colored accent header, badges, and table — clean SaaS look' },
  { value: 'classic', label: 'Classic', description: 'Formal black & white ledger style with serif headings' },
  { value: 'bold', label: 'Bold', description: 'Brand-forward full-width dark header, high visual weight' },
]

/** Default line-items-per-page for A4/A5 sheet invoices, per template. Explicit `a4ItemsPerPage` on print data always wins. */
export const INVOICE_TEMPLATE_ITEMS_PER_PAGE: Record<InvoiceTemplate, { a4: number; a5: number }> = {
  standard: { a4: 14, a5: 7 },
  compact: { a4: 32, a5: 16 },
  modern: { a4: 14, a5: 7 },
  classic: { a4: 14, a5: 7 },
  bold: { a4: 12, a5: 6 },
}

const DEFAULT_TEMPLATE: InvoiceTemplate = 'standard'

/** Branch's configured invoice layout template, falling back to 'standard'. */
export function useBranchInvoiceTemplate(): InvoiceTemplate {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  return branchData?.printSettings?.template ?? DEFAULT_TEMPLATE
}

/**
 * CSS overrides layered on top of the base A4/A5 invoice stylesheet (sales or purchase)
 * per template. Relies on cascade order (same specificity, declared later) — the base
 * stylesheet is left untouched, so 'standard' has zero risk and every other template is
 * additive-only, sharing the same HTML structure and class names.
 */

const COMPACT_A4_CSS = `
  body { padding: 10px; }
  .invoice-header { margin-bottom: 10px; padding-bottom: 8px; border-bottom-width: 2px; }
  .company-logo { max-width: 90px; margin-bottom: 4px; }
  .company-name { font-size: 18px; margin-bottom: 2px; }
  .company-details { font-size: 10px; }
  .company-contact-line { font-size: 10px !important; margin-top: 2px; }
  .invoice-title { font-size: 15px; margin-bottom: 4px; }
  .invoice-meta { font-size: 10px; }
  .invoice-info { gap: 8px 16px; margin-bottom: 10px; padding: 8px 10px; }
  .info-section { gap: 4px; }
  .info-title { font-size: 11px; margin: 0 0 2px; padding-bottom: 2px; }
  .info-row, .customer-bill-line, .detail-value, .info-label, .payment-type-label { font-size: 11px; }
  .bill-to-customer-name, .customer-field-label, .customer-name-highlight { font-size: 11px !important; }
  .items-table { margin-bottom: 8px; }
  .items-table th { padding: 4px 5px; font-size: 11px; }
  .items-table td { padding: 3px 5px; font-size: 10px; }
  .totals-wrapper { padding-top: 6px !important; margin-top: 6px !important; margin-bottom: 6px !important; }
  .totals-table { width: 260px !important; }
  .totals-table td { padding: 4px 8px; font-size: 11px; }
  .totals-table .final-total { font-size: 12px; }
  .barcode-section { margin: 8px 0; padding: 6px; }
  .barcode { font-size: 18px; margin: 4px 0; }
  .barcode-text { font-size: 9px; }
  .notes-section { margin: 8px 0; padding: 8px; }
  .terms-heading { font-size: 12px !important; margin-bottom: 4px !important; }
  .notes-content { font-size: 11px !important; }
  .invoice-branch-note { margin: 8px 0 0; padding: 8px; font-size: 10px; }
  .footer { margin-top: 10px; padding-top: 8px; }
  .footer-line { font-size: 10px !important; margin-bottom: 2px !important; }
  .footer-thank-you { font-size: 12px !important; margin-bottom: 4px !important; }
  .continuation-banner { margin: 0 0 8px; padding: 6px 8px; font-size: 11px; }
  .page-items-summary { margin: 6px 0 4px; font-size: 10px; }
`

const MODERN_ACCENT = '#4f46e5'

const MODERN_A4_CSS = `
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  .invoice-header { border-bottom: 4px solid ${MODERN_ACCENT}; }
  .company-name { color: ${MODERN_ACCENT}; }
  .invoice-title { color: ${MODERN_ACCENT}; text-transform: uppercase; letter-spacing: 0.5px; }
  .invoice-info { background: #eef2ff; border-radius: 10px; }
  .info-title { color: ${MODERN_ACCENT}; border-bottom-color: #c7d2fe; }
  .items-table { border: none; box-shadow: 0 1px 4px rgba(79, 70, 229, 0.15); }
  .items-table th { background: ${MODERN_ACCENT}; color: #fff; border-color: ${MODERN_ACCENT}; }
  .items-table tr:nth-child(even) { background: #f5f5ff; }
  .items-table tbody tr:last-child td { border-bottom-color: ${MODERN_ACCENT}; }
  .totals-table { border-color: ${MODERN_ACCENT}; }
  .totals-table .final-total,
  .totals-table .final-total .total-label,
  .totals-table .final-total .total-amount { background: ${MODERN_ACCENT}; color: #fff; }
  .status-badge { border-radius: 999px; }
  .barcode-section { border: 2px dashed ${MODERN_ACCENT}; }
  .footer { border-top-color: ${MODERN_ACCENT}; }
`

const CLASSIC_A4_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; }
  .invoice-header { border-bottom: 3px double #000; }
  .company-name { color: #000; letter-spacing: 0.3px; }
  .invoice-title { color: #000; text-transform: uppercase; letter-spacing: 1px; }
  .invoice-info { background: none; border: 1px solid #000; border-radius: 0; }
  .info-title { border-bottom: 1px solid #000; color: #000; }
  .items-table { border: 1px solid #000; border-radius: 0; box-shadow: none; }
  .items-table th { background: #000; color: #fff; border-radius: 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .items-table tr:nth-child(even) { background: #f2f2f2; }
  .totals-table { border: 1px solid #000; border-radius: 0; }
  .totals-table .final-total,
  .totals-table .final-total .total-label,
  .totals-table .final-total .total-amount { background: #000; color: #fff; }
  .barcode-section { border: 1px solid #000; border-radius: 0; }
  .status-badge { border-radius: 0; border: 1px solid currentColor; }
  .footer { border-top: 3px double #000; }
`

const BOLD_A4_CSS = `
  body { padding: 24px; }
  .invoice-header { background: #111827; color: #fff; margin: -24px -24px 24px -24px; padding: 32px 24px; border-bottom: none; }
  .company-name { color: #fff; font-size: 30px; }
  .company-details { color: #cbd5e1; }
  .company-contact-line, .company-contact-line .contact-label { color: #cbd5e1 !important; }
  .invoice-title { color: #f59e0b; font-size: 26px; }
  .invoice-meta { color: #cbd5e1; }
  .invoice-info { background: #f9fafb; border: 1px solid #111827; border-radius: 10px; }
  .info-title { color: #111827; border-bottom-color: #111827; }
  .items-table { border: 2px solid #111827; }
  .items-table th { background: #111827; color: #fff; }
  .totals-table { border: 2px solid #111827; }
  .totals-table .final-total,
  .totals-table .final-total .total-label,
  .totals-table .final-total .total-amount { background: #f59e0b; color: #111827; }
  .barcode-section { border: 2px solid #111827; }
  .status-badge { border-radius: 4px; }
  .footer { border-top: 2px solid #111827; }
`

/** CSS override block per template; '' for 'standard' (base stylesheet, untouched). */
export const INVOICE_TEMPLATE_CSS: Record<InvoiceTemplate, string> = {
  standard: '',
  compact: COMPACT_A4_CSS,
  modern: MODERN_A4_CSS,
  classic: CLASSIC_A4_CSS,
  bold: BOLD_A4_CSS,
}
