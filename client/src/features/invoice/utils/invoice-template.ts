import { useSelector } from 'react-redux'
import { useGetBranchQuery, type InvoiceTemplate } from '@/stores/branch.api'
import { RootState } from '@/stores/store'
import { DOC_EXTRAS_BASE, getActivePrintDesign } from '@/lib/print-design'

import type { PrintLanguage } from '@/lib/native-language'
export type { InvoiceTemplate }

export const INVOICE_TEMPLATE_OPTIONS: Array<{ value: InvoiceTemplate; label: string; description: string }> = [
  { value: 'standard', label: 'Standard', description: 'Spacious layout with a larger header and generous spacing' },
  { value: 'compact', label: 'Compact', description: 'Tight margins and rows — fits the most items per page' },
  { value: 'modern', label: 'Modern', description: 'Colored accent header, badges, and table — clean SaaS look' },
  { value: 'classic', label: 'Classic', description: 'Formal black & white ledger style with serif headings' },
  { value: 'bold', label: 'Bold', description: 'Brand-forward full-width dark header, high visual weight' },
  { value: 'ledger', label: 'Ledger', description: 'Centered bold underlined header, like a manual bill book' },
  { value: 'banking', label: 'Banking', description: 'Navy security-pattern header, gold rule, signature strip — like a bank advice' },
  { value: 'corporate', label: 'Corporate', description: 'Clean big-company invoice: light title, boxed details, hairline rows' },
  { value: 'statement', label: 'Statement', description: 'Boxed, gridded utility-bill / account-statement look with monospaced amounts' },
  { value: 'executive', label: 'Executive', description: 'Premium serif design in charcoal and gold, centred letterhead' },
  { value: 'challan', label: 'Challan', description: 'Bank deposit-slip style: green ruled boxes and a tear-off line' },
  { value: 'minimal', label: 'Minimal', description: 'Swiss-style whitespace, thin lines, no fills — saves ink' },
]

/** Default line-items-per-page for A4/A5 sheet invoices, per template. Explicit `a4ItemsPerPage` on print data always wins. */
export const INVOICE_TEMPLATE_ITEMS_PER_PAGE: Record<InvoiceTemplate, { a4: number; a5: number; 'a5-landscape': number }> = {
  standard: { a4: 14, a5: 7, 'a5-landscape': 5 },
  compact: { a4: 32, a5: 16, 'a5-landscape': 11 },
  modern: { a4: 14, a5: 7, 'a5-landscape': 5 },
  classic: { a4: 14, a5: 7, 'a5-landscape': 5 },
  bold: { a4: 12, a5: 6, 'a5-landscape': 4 },
  ledger: { a4: 14, a5: 7, 'a5-landscape': 5 },
  banking: { a4: 12, a5: 6, 'a5-landscape': 4 },
  corporate: { a4: 13, a5: 6, 'a5-landscape': 4 },
  statement: { a4: 14, a5: 7, 'a5-landscape': 5 },
  executive: { a4: 12, a5: 6, 'a5-landscape': 4 },
  challan: { a4: 12, a5: 6, 'a5-landscape': 4 },
  minimal: { a4: 14, a5: 7, 'a5-landscape': 5 },
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
  .invoice-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-areas: "logo logo" "name name" "details meta";
    row-gap: 4px;
    align-items: start;
    margin-bottom: 10px; padding-bottom: 8px; border-bottom-width: 2px;
  }
  .company-info { display: contents; }
  .company-logo { grid-area: logo; max-width: 90px; margin: 0 auto 4px; }
  .company-name { grid-area: name; font-size: 38px; font-weight: 800; color: #000; margin-bottom: 2px; }
  .company-details { grid-area: details; font-size: 13px; }
  .invoice-details { grid-area: meta; }
  .company-contact-line { font-size: 13px !important; margin-top: 2px; }
  .invoice-title { font-size: 15px; margin-bottom: 4px; }
  .invoice-meta { font-size: 10px; }
  .invoice-info { gap: 8px 16px; margin-bottom: 10px; padding: 8px 10px; }
  .info-section { gap: 4px; }
  .info-title { font-size: 11px; margin: 0 0 2px; padding-bottom: 2px; }
  .info-row, .customer-bill-line, .detail-value, .info-label, .payment-type-label { font-size: 11px; }
  .customer-field-label, .customer-name-highlight { font-size: 11px !important; }
  .bill-to-customer-name {
    font-size: 16px !important;
    font-weight: 800 !important;
    color: #000 !important;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .items-table { margin-bottom: 8px; }
  .items-table th { padding: 4px 5px; font-size: 13px; }
  .items-table td { padding: 3px 5px; font-size: 12px; }
  .totals-wrapper { padding-top: 6px !important; margin-top: 6px !important; margin-bottom: 6px !important; }
  .totals-table { width: 260px !important; }
  .totals-table td { padding: 4px 8px; font-size: 11px; }
  .totals-table .total-amount { font-size: 14px !important; }
  .totals-table .final-total { font-size: 12px; }
  .totals-table .final-total .total-amount { font-size: 14px !important; }
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

/**
 * Mirrors the layout of a handwritten ledger bill book: business name centered,
 * bold, and underlined, with the address/contact stacked centered beneath it —
 * instead of the base template's left-logo/right-meta split header.
 */
const LEDGER_A4_CSS = `
  .invoice-header { flex-direction: column; align-items: center; text-align: center; border-bottom: 4px double #000; padding-bottom: 16px; }
  .company-info { flex: none; width: 100%; display: flex; flex-direction: column; align-items: center; }
  .company-logo { margin: 0 auto 8px; }
  .company-name { display: inline-block; color: #000; font-size: 32px; font-weight: 900; border-bottom: 3px solid #000; padding: 0 6px 6px; margin: 0 auto 10px; }
  .company-details { text-align: center; font-size: 15px; }
  .company-contact-line { display: inline-block; margin-top: 4px; font-size: 15px; font-weight: 700; }
  .invoice-details { flex: none; width: 100%; text-align: center; margin-top: 12px; }
  .invoice-title { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 6px; }
  .invoice-meta { display: flex; justify-content: center; gap: 18px; font-size: 13px; color: #000; }
  .invoice-meta div { white-space: nowrap; }
`


/* ── Bank / big-company designs ─────────────────────────────────────────────
 * Same shared HTML as every other template. Two helpers keep them honest:
 *  - letter-spacing breaks joined scripts (Urdu, Arabic, Hindi's Devanagari), so every
 *    design that spaces its capitals resets it for those prints (RTL_RESET);
 *  - the "amount payable" highlight goes on the last row of the LAST totals table
 *    only (an itemised table above it can end in a tax row, which must not glow).
 */

const RTL_RESET = `html[dir="rtl"] *, html[lang="hi"] * { letter-spacing: 0 !important; }`
const LAST_TOTAL_ROW = `.totals-wrapper:not(:has(~ .totals-wrapper)) .totals-table tr:last-child td`
const NUMERIC = `font-variant-numeric: tabular-nums;`

// DOC_EXTRAS_BASE (signature-strip CSS) lives in lib/print-design.ts, shared with the designer's "always show".

const BANK_NAVY = '#0b2a4a'
const BANK_GOLD = '#c9a227'
const BANKING_A4_CSS = `
  body { font-family: 'Inter', system-ui, sans-serif; color: #0f172a; }
  .invoice-header {
    background-color: ${BANK_NAVY};
    background-image:
      repeating-linear-gradient(45deg, rgba(255,255,255,.045) 0 1px, transparent 1px 8px),
      repeating-linear-gradient(-45deg, rgba(255,255,255,.045) 0 1px, transparent 1px 8px);
    color: #fff; padding: 22px 24px; margin-bottom: 0; border-bottom: 4px solid ${BANK_GOLD}; border-radius: 4px 4px 0 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .company-name { color: #fff; font-size: 30px; font-weight: 800; line-height: 1.2; }
  .company-details, .company-contact-line, .company-contact-line .contact-label { color: #cbd5e1 !important; font-size: 13px; }
  .invoice-title { color: ${BANK_GOLD}; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; }
  .invoice-meta { color: #e2e8f0; font-size: 13px; }
  .invoice-meta strong { color: #fff; font-family: ui-monospace, 'Courier New', monospace; letter-spacing: 1px; }
  .invoice-info { background: #f1f5f9; border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 4px 4px; padding: 16px 24px; margin-bottom: 24px; }
  .info-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: ${BANK_NAVY}; border-bottom: 1px solid #94a3b8; }
  .items-table { border: 1px solid ${BANK_NAVY}; box-shadow: none; }
  .items-table th { background: ${BANK_NAVY}; color: #fff; border-color: ${BANK_NAVY}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 10px 8px; border-radius: 0 !important; }
  .items-table td { border-left: none; border-right: none; border-color: #e2e8f0; ${NUMERIC} }
  .items-table tbody tr:nth-child(even) { background: #f8fafc; }
  .items-table tbody tr:last-child td { border-bottom: 2px solid ${BANK_NAVY}; }
  .totals-table { border: 1px solid ${BANK_NAVY}; border-radius: 0; }
  .totals-table td { ${NUMERIC} }
  .totals-table .total-label { background: #f1f5f9 !important; color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: .4px; border-right-color: #cbd5e1; }
  ${LAST_TOTAL_ROW} { background: ${BANK_NAVY} !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-section { border: 1px dashed ${BANK_NAVY}; border-radius: 0; }
  .footer { position: relative; border-top: 2px dashed #94a3b8; color: #475569; }
  .footer::before { content: '\\2702'; position: absolute; top: -12px; inset-inline-start: 18px; padding: 0 6px; background: #fff; color: #64748b; font-size: 14px; }
  .doc-sign-line { border-bottom-color: ${BANK_NAVY}; }
  ${DOC_EXTRAS_BASE}
  ${RTL_RESET}
`

const CORP_BLUE = '#0f4c81'
const CORPORATE_A4_CSS = `
  body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; }
  .invoice-header { border-bottom: 1px solid #cbd5e1; border-inline-start: 6px solid ${CORP_BLUE}; padding: 4px 0 18px; padding-inline-start: 18px; }
  .company-name { color: #0f172a; font-size: 30px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.15; }
  .company-details { color: #475569; font-size: 13px; }
  .invoice-title { color: ${CORP_BLUE}; font-size: 30px; font-weight: 300; line-height: 1.15; text-transform: uppercase; letter-spacing: 4px; }
  .invoice-meta { color: #475569; font-size: 13px; }
  .invoice-info { background: none; padding: 0; gap: 16px; border-radius: 0; }
  .info-section { border: 1px solid #e2e8f0; border-top: 3px solid ${CORP_BLUE}; border-radius: 4px; padding: 12px 14px; }
  .info-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; border: none; padding: 0; }
  .items-table { border: none; box-shadow: none; }
  .items-table th { background: #f1f5f9; color: #0f172a; border: none; border-bottom: 2px solid ${CORP_BLUE}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-radius: 0 !important; }
  .items-table td { border: none; border-bottom: 1px solid #e2e8f0; ${NUMERIC} }
  .totals-table { border: none; border-radius: 0; }
  .totals-table td { border-bottom: 1px solid #e2e8f0; ${NUMERIC} }
  .totals-table .total-label { background: none !important; color: #475569; font-weight: 600; border-right: none; }
  .totals-table .total-amount { background: none !important; }
  ${LAST_TOTAL_ROW} { border-top: 2px solid ${CORP_BLUE}; border-bottom: none; color: ${CORP_BLUE} !important; font-size: 18px !important; font-weight: 800; }
  .barcode-section { border: 1px solid #e2e8f0; }
  .footer { border-top: 1px solid #cbd5e1; color: #64748b; }
  ${DOC_EXTRAS_BASE}
  ${RTL_RESET}
`

const STATEMENT_A4_CSS = `
  body { font-family: 'Inter', system-ui, sans-serif; color: #111; }
  .invoice-header { border: 2px solid #111; border-radius: 0; padding: 14px 18px; margin-bottom: 0; }
  .company-name { color: #111; font-size: 26px; font-weight: 800; line-height: 1.2; }
  .company-details { font-size: 13px; color: #333; }
  .invoice-title { display: inline-block; background: #111; color: #fff; padding: 4px 12px; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice-meta { color: #111; font-size: 13px; }
  .invoice-meta strong { font-family: ui-monospace, 'Courier New', monospace; }
  .invoice-info { background: none; border: 2px solid #111; border-top: none; border-radius: 0; padding: 0; gap: 0; margin-bottom: 22px; align-items: stretch; }
  .info-section { padding: 0 12px 12px; gap: 6px; }
  .info-section .info-title { align-self: stretch; }
  .info-section + .info-section { border-inline-start: 1px solid #111; }
  .info-title { margin: 0 -12px 6px; padding: 6px 12px; background: #e5e7eb; border-bottom: 1px solid #111; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .items-table { border: 2px solid #111; box-shadow: none; }
  .items-table th { background: #e5e7eb; color: #111; border: 1px solid #111; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; border-radius: 0 !important; }
  .items-table td { border: 1px solid #9ca3af; }
  .items-table td.text-right, .totals-table .total-amount { font-family: ui-monospace, 'Courier New', monospace; }
  .totals-table { border: 2px solid #111; border-radius: 0; }
  .totals-table td { border-bottom: 1px solid #9ca3af; }
  .totals-table .total-label { background: #e5e7eb !important; border-right: 1px solid #111; color: #111; font-size: 13px; text-transform: uppercase; }
  ${LAST_TOTAL_ROW} { background: #111 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-section { border: 1px solid #111; border-radius: 0; }
  .status-badge { border-radius: 0; border: 1px solid currentColor; }
  .footer { border-top: 2px solid #111; color: #333; }
  .doc-sign-line { border-bottom-color: #111; }
  ${DOC_EXTRAS_BASE}
  ${RTL_RESET}
`

const EXEC_INK = '#1c1917'
const EXEC_GOLD = '#a8834a'
const EXECUTIVE_A4_CSS = `
  body { font-family: Georgia, 'Times New Roman', 'Noto Naskh Arabic', serif; color: ${EXEC_INK}; }
  .invoice-header { flex-direction: column; align-items: center; text-align: center; border-bottom: none; padding-bottom: 14px; margin-bottom: 22px; }
  .invoice-header::after { content: ''; display: block; width: 100%; height: 5px; margin-top: 14px; border-top: 1px solid ${EXEC_GOLD}; border-bottom: 1px solid ${EXEC_GOLD}; }
  .company-info { flex: none; width: 100%; display: flex; flex-direction: column; align-items: center; }
  .company-logo { margin: 0 auto 8px; }
  .company-name { color: ${EXEC_INK}; font-size: 32px; font-weight: 400; text-transform: uppercase; letter-spacing: 5px; line-height: 1.25; }
  .company-details { text-align: center; color: #57534e; font-size: 13px; font-style: italic; }
  .invoice-details { flex: none; width: 100%; text-align: center; margin-top: 10px; }
  .invoice-title { color: ${EXEC_GOLD}; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 6px; margin-bottom: 4px; }
  .invoice-meta { display: flex; justify-content: center; gap: 22px; font-size: 13px; color: #57534e; }
  .invoice-meta div { white-space: nowrap; }
  .invoice-info { background: #fafaf9; border: 1px solid #e7e5e4; border-top: 2px solid ${EXEC_GOLD}; border-radius: 0; }
  .info-title { font-weight: 400; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${EXEC_GOLD}; border-bottom: 1px solid #e7e5e4; }
  .items-table { border: none; box-shadow: none; }
  .items-table th { background: none; color: ${EXEC_INK}; border: none; border-top: 1px solid ${EXEC_INK}; border-bottom: 2px solid ${EXEC_GOLD}; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; border-radius: 0 !important; }
  .items-table td { border: none; border-bottom: 1px solid #e7e5e4; ${NUMERIC} }
  .totals-table { border: 1px solid #d6d3d1; border-radius: 0; }
  .totals-table .total-label { background: #fafaf9 !important; border-right-color: #e7e5e4; font-weight: 400; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; }
  ${LAST_TOTAL_ROW} { background: ${EXEC_INK} !important; color: #e7c98f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-section { border: 1px solid ${EXEC_GOLD}; border-radius: 0; }
  .footer { border-top: 1px solid ${EXEC_GOLD}; color: #57534e; font-style: italic; }
  .doc-sign { font-style: italic; color: #57534e; }
  .doc-sign-line { border-bottom-color: ${EXEC_GOLD}; }
  ${DOC_EXTRAS_BASE}
  ${RTL_RESET}
`

const CHALLAN_GREEN = '#14532d'
const CHALLAN_TINT = '#ecfdf3'
const CHALLAN_A4_CSS = `
  body { font-family: 'Inter', system-ui, sans-serif; color: #052e16; }
  .invoice-header { border: 2px solid ${CHALLAN_GREEN}; border-radius: 0; padding: 0; margin-bottom: 0; align-items: stretch; }
  .company-info { padding: 14px 16px; border-inline-end: 2px solid ${CHALLAN_GREEN}; }
  .company-name { color: ${CHALLAN_GREEN}; font-size: 26px; font-weight: 800; line-height: 1.2; }
  .company-details { color: #14532d; font-size: 13px; }
  .invoice-details { padding: 14px 16px; background: ${CHALLAN_TINT}; min-width: 34%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice-title { color: #fff; background: ${CHALLAN_GREEN}; padding: 4px 10px; font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice-meta { color: #052e16; font-size: 13px; }
  .invoice-meta strong { font-family: ui-monospace, 'Courier New', monospace; font-size: 15px; }
  .invoice-info { background: none; border: 2px solid ${CHALLAN_GREEN}; border-top: none; border-radius: 0; padding: 12px 16px; margin-bottom: 20px; }
  .info-title { color: ${CHALLAN_GREEN}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px dashed ${CHALLAN_GREEN}; }
  .items-table { border: 2px solid ${CHALLAN_GREEN}; box-shadow: none; }
  .items-table th { background: ${CHALLAN_TINT}; color: ${CHALLAN_GREEN}; border: 1px solid ${CHALLAN_GREEN}; font-size: 12px; text-transform: uppercase; border-radius: 0 !important; }
  .items-table td { border: 1px solid #86efac; ${NUMERIC} }
  .totals-table { border: 2px solid ${CHALLAN_GREEN}; border-radius: 0; }
  .totals-table td { border-bottom: 1px solid #86efac; ${NUMERIC} }
  .totals-table .total-label { background: ${CHALLAN_TINT} !important; color: ${CHALLAN_GREEN}; border-right: 1px solid ${CHALLAN_GREEN}; }
  ${LAST_TOTAL_ROW} { background: ${CHALLAN_GREEN} !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-section { border: 2px solid ${CHALLAN_GREEN}; border-radius: 0; }
  .footer { position: relative; border-top: 2px dashed ${CHALLAN_GREEN}; color: ${CHALLAN_GREEN}; }
  .footer::before { content: '\\2702'; position: absolute; top: -12px; inset-inline-start: 18px; padding: 0 6px; background: #fff; color: ${CHALLAN_GREEN}; font-size: 14px; }
  .doc-sign { color: ${CHALLAN_GREEN}; }
  .doc-sign-line { border: 1px solid ${CHALLAN_GREEN}; height: 40px; }
  ${DOC_EXTRAS_BASE}
  ${RTL_RESET}
`

const MINIMAL_A4_CSS = `
  body { font-family: 'Inter', system-ui, sans-serif; color: #111827; }
  .invoice-header { border-bottom: 1px solid #111827; padding-bottom: 24px; margin-bottom: 28px; }
  .company-name { color: #111827; font-size: 22px; font-weight: 700; line-height: 1.3; }
  .company-details { color: #6b7280; font-size: 13px; }
  .invoice-title { color: #111827; font-size: 40px; font-weight: 200; letter-spacing: -1px; text-transform: lowercase; }
  .invoice-meta { color: #6b7280; font-size: 13px; }
  .invoice-info { background: none; padding: 0; border-radius: 0; }
  .info-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; border: none; padding: 0; }
  .items-table { border: none; box-shadow: none; }
  .items-table th { background: none; color: #6b7280; border: none; border-bottom: 1px solid #111827; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; border-radius: 0 !important; }
  .items-table td { border: none; border-bottom: 1px solid #f3f4f6; ${NUMERIC} }
  .totals-table { border: none; border-radius: 0; }
  .totals-table td { border-bottom: none; ${NUMERIC} }
  .totals-table .total-label { background: none !important; color: #6b7280; font-weight: 500; border-right: none; }
  .totals-table .total-amount { background: none !important; }
  ${LAST_TOTAL_ROW} { border-top: 1px solid #111827; font-size: 20px !important; font-weight: 700; }
  .barcode-section { border: none; }
  .status-badge { background: none !important; border: 1px solid currentColor; border-radius: 999px; }
  .footer { border-top: none; color: #9ca3af; }
  ${RTL_RESET}
`

/** Templates that print the signature strip and "computer-generated" note. */
const TEMPLATES_WITH_SIGNATURES = new Set<InvoiceTemplate>(['banking', 'corporate', 'statement', 'executive', 'challan'])

const DOC_EXTRAS_LABELS = {
  en: {
    prepared_by: 'Prepared by',
    authorised: 'Authorised signatory',
    customer: 'Customer signature',
    supplier: 'Supplier signature',
    note: 'This is a computer-generated document.',
  },
  ur: {
    prepared_by: 'تیار کنندہ',
    authorised: 'مجاز دستخط',
    customer: 'کسٹمر کے دستخط',
    supplier: 'سپلائر کے دستخط',
    note: 'یہ کمپیوٹر سے تیار کردہ دستاویز ہے۔',
  },
  ar: {
    prepared_by: 'أعدّه',
    authorised: 'المفوض بالتوقيع',
    customer: 'توقيع العميل',
    supplier: 'توقيع المورد',
    note: 'هذا مستند صادر إلكترونيًا.',
  },
  hi: {
    prepared_by: 'तैयारकर्ता',
    authorised: 'अधिकृत हस्ताक्षरकर्ता',
    customer: 'ग्राहक हस्ताक्षर',
    supplier: 'आपूर्तिकर्ता हस्ताक्षर',
    note: 'यह कंप्यूटर द्वारा तैयार दस्तावेज़ है।',
  },
} as const

/** Signature strip for the formal templates; '' for every other template. */
export function invoiceTemplateExtrasHtml(template: InvoiceTemplate, language: PrintLanguage, party: 'customer' | 'supplier'): string {
  // The invoice designer can force the strip on (any template) or off (even a formal one).
  const choice = getActivePrintDesign().signatures
  if (choice === 'hide') return ''
  if (choice !== 'show' && !TEMPLATES_WITH_SIGNATURES.has(template)) return ''
  const t = DOC_EXTRAS_LABELS[language] ?? DOC_EXTRAS_LABELS.en
  const sign = (label: string) => `<div class="doc-sign"><span class="doc-sign-line"></span>${label}</div>`
  return `
  <div class="doc-extras">
    <div class="doc-signs">${sign(t.prepared_by)}${sign(t.authorised)}${sign(party === 'supplier' ? t.supplier : t.customer)}</div>
    <div class="doc-note">${t.note}</div>
  </div>`
}

/** CSS override block per template; '' for 'standard' (base stylesheet, untouched). */
export const INVOICE_TEMPLATE_CSS: Record<InvoiceTemplate, string> = {
  standard: '',
  compact: COMPACT_A4_CSS,
  modern: MODERN_A4_CSS,
  classic: CLASSIC_A4_CSS,
  bold: BOLD_A4_CSS,
  ledger: LEDGER_A4_CSS,
  banking: BANKING_A4_CSS,
  corporate: CORPORATE_A4_CSS,
  statement: STATEMENT_A4_CSS,
  executive: EXECUTIVE_A4_CSS,
  challan: CHALLAN_A4_CSS,
  minimal: MINIMAL_A4_CSS,
}

