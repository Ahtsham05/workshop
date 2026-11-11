/**
 * "Distributor" invoice layout — a wholesale/distribution sales document: centred logo,
 * document number with a Code 39 barcode, Sold To / Ship To, a Terms · Status · Invoiced By ·
 * Rep · Tax ID band, UPC / SO / IO / Out item columns, totals, a grey balance band, policies,
 * a signature line and a page footer.
 *
 * Unlike the other templates (CSS overlays on one shared HTML structure, see
 * invoice-template.ts) this one has its own markup, so it is generated here. It still emits
 * `#invoice-print-root` > `.invoice-print-page` sheets, one per physical page, so the print
 * window's Save PDF / WhatsApp send capture it page by page exactly like every other layout.
 *
 * All sizes are written in `--u` units (1pt on A4) so the same layout scales down for A5.
 */
import { escapeHtml } from '@/lib/escape-html'
import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import { invoiceTermsToSafeHtml } from '@/lib/rich-text-utils'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { getActivePrintColors } from '@/lib/print-colors'
import { getActivePrintDesign } from '@/lib/print-design'
import { printScriptFontFamilies, printScriptFontParams } from '@/lib/native-language'
import { formatImeiEntries } from '@/stores/imei.api'
import { buildTaxBreakdownHtml } from '@/lib/tax-print-rows'
import type { PrintInvoiceData } from './print-utils'
import {
  DISTRIBUTOR_LICENSE_FIELDS,
  DISTRIBUTOR_MISSING_VALUE,
  getActiveDistributorSettings,
} from './distributor-settings'
import type { SheetSize } from './paper-format'

/** What print-utils has already resolved for this print (language, numbering, warehouse…). */
export interface DistributorPrintContext {
  /** Names (items, customer, business) in the native script. */
  nativeNames: boolean
  printNumber: string
  documentDate: Date
  isQuotation: boolean
  /** '' when the warehouse is not printed. */
  warehouseLabel: string
  warehouseWord: string
  /** Print / PDF / WhatsApp / SMS action bar (hidden when printing). */
  printActionsHtml: string
  printActionsCss: string
}

type Layout = 'single' | 'half-left' | 'half-right'

/** Page geometry per sheet, in `u` (1u = `unit`). */
const SHEETS = {
  a4: { widthMm: 210, heightMm: 297, unit: 1, heightU: 842 },
  a5: { widthMm: 148, heightMm: 210, unit: 0.7, heightU: 850 },
  'a5-landscape': { widthMm: 210, heightMm: 148, unit: 0.7, heightU: 600 },
} as const
type SheetKey = keyof typeof SHEETS

const PAYMENT_TERMS: Record<string, string> = {
  cash: 'Cash',
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
}

const esc = (v: unknown) => escapeHtml(String(v ?? ''))

/** Code 39 encodes A–Z 0–9 and - . $ / + % space; anything else would print a broken barcode. */
const barcodeSafe = (value: string) => value.toUpperCase().replace(/[^A-Z0-9\-. $/+%]/g, '-')

function partyName(data: PrintInvoiceData, native: boolean): string {
  if (data.customerId === 'walk-in') return data.walkInCustomerName?.trim() || 'Walk-in Customer'
  const en = data.customerName?.trim() || ''
  const ur = data.customerNameUrdu?.trim() || ''
  return (native ? ur || en : en || ur) || 'Customer'
}

function termsText(data: PrintInvoiceData, isQuotation: boolean): string {
  if (isQuotation) return 'Quotation'
  const fromCustomer = data.customerPaymentTerms ? PAYMENT_TERMS[data.customerPaymentTerms] : ''
  if (fromCustomer) return fromCustomer
  switch (data.type) {
    case 'cash': return 'Cash'
    case 'credit': return 'Credit'
    case 'pending': return 'Pending'
    default: return '-'
  }
}

function statusText(data: PrintInvoiceData, isQuotation: boolean): string {
  if (isQuotation) return 'Quotation'
  if (data.type === 'pending') return 'Sales Order'
  const total = Number(data.total) || 0
  const paid = Number(data.paidAmount) || 0
  if (total > 0 && paid >= total) return 'Paid'
  if (paid > 0) return 'Partially Paid'
  return 'Invoiced'
}

function documentTitle(isQuotation: boolean): string {
  if (isQuotation) return 'QUOTATION'
  return getActivePrintDesign().texts.title || 'SALES ORDER'
}

/* ── Pagination ─────────────────────────────────────────────────────────────
 * Rows are split into whole sheets up front (never mid-row), by estimated height. Every
 * height below is in `u` and mirrors the CSS further down.
 */
const ROW_BASE_U = 4
const LINE_U = 12
const PAGE_TOP_PAD_U = 20
const TABLE_HEAD_U = 31 // gap above the table + heading row
const NEXT_PAGE_TOP_U = PAGE_TOP_PAD_U + 17 + TABLE_HEAD_U // continuation strip + table heading
const FOOTER_U = 62 // spacer + page footer
const SAFETY_U = 8 // rounding / font-metric slack, so a sheet never spills onto a blank page
const NAME_CHARS_PER_LINE = 50

type Item = PrintInvoiceData['items'][number]

function itemLines(item: Item): number {
  let lines = Math.max(1, Math.ceil((item.name || '').length / NAME_CHARS_PER_LINE))
  if (item.imeis && item.imeis.length > 0) lines += 1
  if (item.discountAmount) lines = Math.max(lines, 2)
  if ((item.code || '').length > 16) lines = Math.max(lines, Math.ceil(item.code!.length / 16))
  return lines
}
const itemHeight = (item: Item) => ROW_BASE_U + LINE_U * itemLines(item)

function textLines(html: string, charsPerLine: number): number {
  const plain = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  return plain.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

function paginate(items: Item[], pageHeightU: number, firstTopU: number, summaryU: number, fixedPerPage?: number): Item[][] {
  if (items.length === 0) return [[]]
  if (fixedPerPage && fixedPerPage > 0) {
    const pages: Item[][] = []
    for (let i = 0; i < items.length; i += fixedPerPage) pages.push(items.slice(i, i + fixedPerPage))
    return pages
  }
  const firstCap = pageHeightU - firstTopU - FOOTER_U - SAFETY_U
  const nextCap = pageHeightU - NEXT_PAGE_TOP_U - FOOTER_U - SAFETY_U
  const pages: Item[][] = []
  let current: Item[] = []
  let used = 0
  let cap = firstCap
  for (const item of items) {
    const h = itemHeight(item)
    if (current.length > 0 && used + h > cap) {
      pages.push(current)
      current = []
      used = 0
      cap = nextCap
    }
    current.push(item)
    used += h
  }
  pages.push(current)

  // The totals block must fit on the last sheet. If it does not, carry the final row onto a
  // new sheet with it (a totals block never stands alone), leaving the previous sheet full.
  const lastIndex = pages.length - 1
  const last = pages[lastIndex]
  const lastCap = lastIndex === 0 ? firstCap : nextCap
  const lastUsed = last.reduce((s, it) => s + itemHeight(it), 0)
  if (lastUsed + summaryU > lastCap && last.length > 1) {
    pages.push([last.pop()!])
  }
  return pages
}

/* ── Markup ─────────────────────────────────────────────────────────────── */

function companyLines(data: PrintInvoiceData, native: boolean): string[] {
  const company = (native ? data.companyNameUrdu || data.companyName : data.companyName || data.companyNameUrdu) || ''
  const address = (native ? data.invoiceAddressUrdu || data.invoiceAddress : data.invoiceAddress || data.invoiceAddressUrdu) || ''
  return [
    company && `<div class="ds-co-name" dir="auto">${esc(company)}</div>`,
    ...address.split(/\r?\n/).filter((l) => l.trim()).slice(0, 3).map((l) => `<div dir="auto">${esc(l.trim())}</div>`),
    data.companyPhone && `<div>Phone: <bdi dir="ltr">${esc(data.companyPhone)}</bdi></div>`,
    data.companyWebsite && `<div>${esc(data.companyWebsite)}</div>`,
    data.companyEmail && `<div>${esc(data.companyEmail)}</div>`,
  ].filter((l): l is string => Boolean(l))
}

/** Date + every licence line (always printed, "N/A" when not entered in Settings → Printing). */
function metaLines(data: PrintInvoiceData, ctx: DistributorPrintContext): string[] {
  const settings = getActiveDistributorSettings()
  const dateText = data.invoiceDateTime ? formatAppDateTime(data.invoiceDateTime) : formatAppDate(ctx.documentDate)
  const licences = DISTRIBUTOR_LICENSE_FIELDS.map(({ key, label }) => {
    // The organisation's tax number stands in for an empty State Tax Id.
    const value = settings[key] || (key === 'stateTaxId' ? data.companyTaxNumber?.trim() : '') || DISTRIBUTOR_MISSING_VALUE
    return `${label}: ${esc(value)}`
  })
  return [
    `Date: ${esc(dateText)}`,
    ...licences,
    // Only when the branch turned on Settings → Warehouses → "Show on prints".
    ctx.warehouseLabel && `${esc(ctx.warehouseWord)}: ${ctx.warehouseLabel}`,
  ].filter((l): l is string => Boolean(l))
}

/** Printed lines of the meta block once it wraps in its 151u column (~31 SemiBold 8pt chars). */
const metaLineCount = (lines: string[]) =>
  lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/&[a-z#0-9]+;/gi, '_').length / 31)), 0)

function partyLines(data: PrintInvoiceData, native: boolean): string[] {
  const walkIn = data.customerId === 'walk-in'
  const address = (data.customerAddress || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const phone = data.customerPhone?.trim()
  return [
    `<div class="ds-party-name" dir="auto">${esc(partyName(data, native))}</div>`,
    ...address.map((l) => `<div dir="auto">${esc(l)}</div>`),
    !walkIn && !address.length ? '<div>N/A</div>' : '',
    phone ? `<div>Phone: <bdi dir="ltr">${esc(phone)}</bdi></div>` : '',
    data.customerEmail ? `<div>${esc(data.customerEmail)}</div>` : '',
  ].filter(Boolean)
}

const hasLogo = (data: PrintInvoiceData) => Boolean(data.companyLogo || data.isTrial)
const barcodeFontU = (value: string) => Math.min(14, 260 / Math.max(1, value.length + 2))

/** Height (u) of everything above the first item row on page 1 — mirrors the CSS below. */
function firstPageTopU(data: PrintInvoiceData, ctx: DistributorPrintContext): number {
  const co = companyLines(data, ctx.nativeNames).length * 13.2
  const logo = hasLogo(data) ? 97 : 0
  const doc = 24 + 24 + barcodeFontU(barcodeSafe(ctx.printNumber)) * 1.15 + 1 + metaLineCount(metaLines(data, ctx)) * 12
  const parties = 14 + 15 + partyLines(data, ctx.nativeNames).length * 12
  const terms = 4 + 19.5 + 13
  return PAGE_TOP_PAD_U + Math.max(co, logo, doc) + parties + terms + TABLE_HEAD_U
}

function letterhead(data: PrintInvoiceData, ctx: DistributorPrintContext, title: string): string {
  const native = ctx.nativeNames
  const company = (native ? data.companyNameUrdu || data.companyName : data.companyName || data.companyNameUrdu) || ''

  const logo = data.companyLogo
    ? `<img class="ds-logo" src="${esc(data.companyLogo)}" alt="${esc(company)}" />`
    : data.isTrial
      ? `<img class="ds-logo" src="/images/logo-light.png" alt="Logix Plus solutions" />`
      : ''

  const barcodeValue = barcodeSafe(ctx.printNumber)
  // The barcode font is ~0.57em per character: shrink long numbers so they stay in the column.
  const barcodeSize = barcodeFontU(barcodeValue)
  // Poppins SemiBold is ~0.64em per character: keep the number on one line in the 151u column.
  const numberSize = Math.min(16, 150 / Math.max(1, ctx.printNumber.length * 0.64))

  const meta = metaLines(data, ctx)

  return `
  <header class="ds-head">
    <div class="ds-co">${companyLines(data, native).join('')}</div>
    <div class="ds-logo-slot">${logo}</div>
    <div class="ds-doc">
      <div class="ds-title">${esc(title)} :</div>
      <div class="ds-number" style="font-size:calc(${numberSize.toFixed(2)} * var(--u))">${esc(ctx.printNumber)}</div>
      ${barcodeValue ? `<div class="ds-barcode" style="font-size:calc(${barcodeSize.toFixed(2)} * var(--u))" aria-hidden="true">*${esc(barcodeValue)}*</div>` : ''}
      <div class="ds-meta">${meta.map((m) => `<div>${m}</div>`).join('')}</div>
    </div>
  </header>`
}

function partyBlock(label: string, data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  return `<div class="ds-party"><div class="ds-label-box">${label}</div>${partyLines(data, ctx.nativeNames).join('')}</div>`
}

function termsBand(data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  const cells: Array<[string, string]> = [
    ['Terms', termsText(data, ctx.isQuotation)],
    ['Status', statusText(data, ctx.isQuotation)],
    ['Invoiced By', data.invoicedBy?.trim() || '-'],
    ['Rep', data.salesRep?.trim() || '-'],
    ['Tax ID/Hemp', `${data.customerTaxNumber?.trim() || '-'}/-`],
  ]
  return `
  <div class="ds-terms">
    <div class="ds-terms-head">${cells.map(([h]) => `<div>${h}</div>`).join('')}</div>
    <div class="ds-terms-body">${cells.map(([, v]) => `<div dir="auto">${esc(v)}</div>`).join('')}</div>
  </div>`
}

function itemsTable(rows: Item[], startIndex: number, fmt: (n: number) => string, native: boolean): string {
  const body = rows.length
    ? rows
        .map((item, i) => {
          const name = native ? item.nameUrdu?.trim() || item.name : item.name
          const qty = Number(item.quantity) || 0
          const unit = item.unit && !/^(pcs?|piece|pieces|unit|units|nos?)$/i.test(item.unit.trim()) ? ` ${esc(item.unit)}` : ''
          const extra = item.imeis && item.imeis.length > 0
            ? `<div class="ds-sub">IMEI/Serial: ${esc(formatImeiEntries(item.imeis))}</div>`
            : ''
          const gross = item.discountAmount ? `<div class="ds-strike">${fmt(qty * (Number(item.unitPrice) || 0))}</div>` : ''
          return `
      <tr${(startIndex + i) % 2 === 1 ? ' class="ds-zebra"' : ''} data-sub="${Number(item.subtotal) || 0}">
        <td class="ds-c-no">${startIndex + i + 1}</td>
        <td class="ds-c-upc">${esc(item.code || '')}</td>
        <td class="ds-c-name" dir="auto">${esc(name)}${extra}</td>
        <td class="ds-c-qty">${qty}${unit}</td>
        <td class="ds-c-qty">${qty}${unit}</td>
        <td class="ds-c-qty">0</td>
        <td class="ds-c-num">${fmt(Number(item.unitPrice) || 0)}</td>
        <td class="ds-c-num">${fmt(Number(item.taxAmount) || 0)}</td>
        <td class="ds-c-num">${gross}${fmt(Number(item.subtotal) || 0)}</td>
      </tr>`
        })
        .join('')
    : '<tr><td></td><td></td><td class="ds-c-name">No items</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  return `
  <table class="ds-items">
    <colgroup>
      <col style="width:3.27%"><col style="width:13.73%"><col style="width:35.62%"><col style="width:4.58%">
      <col style="width:4.9%"><col style="width:4.9%"><col style="width:11.44%"><col style="width:8.17%"><col style="width:13.39%">
    </colgroup>
    <thead>
      <tr>
        <th></th><th class="ds-c-upc">UPC</th><th class="ds-c-name">Product Name / Description</th>
        <th class="ds-c-qty">SO</th><th class="ds-c-qty">IO</th><th class="ds-c-qty">Out</th>
        <th class="ds-c-num">Sold Price</th><th class="ds-c-num">Tax</th><th class="ds-c-num">Amount</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`
}

/** Tax rows exactly as every other print shows them (one flat row, or per category / component). */
function taxRowsHtml(data: PrintInvoiceData, fmt: (n: number) => string): string {
  return buildTaxBreakdownHtml(data.taxLines, Number(data.tax) || 0, 'Tax', (label, amount, indent) =>
    `<tr><th${indent ? ' class="ds-indent"' : ''}>${esc(label)}</th><td>${fmt(amount)}</td></tr>`,
  )
}

function summary(data: PrintInvoiceData, ctx: DistributorPrintContext, fmt: (n: number) => string): string {
  const items = data.items || []
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  const lineTotal = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)
  const total = Number(data.total) || 0
  const paid = Number(data.paidAmount) || 0
  const discount = Number(data.discount) || 0
  const delivery = Number(data.deliveryCharge) || 0
  const service = Number(data.serviceCharge) || 0

  const upper: Array<[string, string]> = [
    ['Total Quantity', String(Math.round(totalQty * 1000) / 1000)],
    ['Subtotal', fmt(lineTotal)],
    ...(discount > 0 ? [['Discount', `<bdi dir="ltr">-${fmt(discount)}</bdi>`] as [string, string]] : []),
  ]
  const upperTail: Array<[string, string]> = [
    ...(service > 0 ? [['Service Charge', fmt(service)] as [string, string]] : []),
    ['Shipping', fmt(delivery)],
  ]
  const lower: Array<[string, string]> = ctx.isQuotation
    ? [['Grand Total', fmt(total)]]
    : [
        ['Grand Total', fmt(total)],
        ['Total Paid', fmt(paid)],
        ['Due Amount', fmt(Math.max(0, total - paid))],
      ]
  const rowsHtml = (rows: Array<[string, string]>) =>
    rows.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${v}</td></tr>`).join('')

  const shipMethod = delivery > 0 ? 'Delivery' : 'In Store Pick Up'
  const shipDate = formatAppDate(ctx.documentDate)

  // Running balance — registered customers only, never on a quotation.
  const showBalances = !ctx.isQuotation
  const prev = data.customerId === 'walk-in' ? 0 : Number(data.previousBalance) || 0
  const after = data.newBalance != null && data.customerId !== 'walk-in' ? Number(data.newBalance) : prev + total - paid
  const balanceText = (n: number) => `${fmt(Math.abs(n))}${n < 0 ? ' (Cr)' : ''}`

  const notesHtml = data.notes ? invoiceTermsToSafeHtml(String(data.notes)) : ''
  const termsHtml = data.termsAndConditions ? invoiceTermsToSafeHtml(String(data.termsAndConditions)) : ''
  const settings = getActiveDistributorSettings()
  const plain = (text: string) => (text ? escapeHtml(text).replace(/\r?\n/g, '<br />') : '')
  // Invoice-specific notes / T&C print only when entered; the three policy headings always print.
  const policy = (heading: string, html: string, always = false) =>
    html || always
      ? `<div class="ds-policy"><div class="ds-policy-h">${heading}</div>${html ? `<div class="ds-policy-t" dir="auto">${html}</div>` : ''}</div>`
      : ''

  return `
  <section class="ds-summary">
    <div class="ds-ship">
      <div><span class="ds-ship-l">Ship Method:</span><span>${shipMethod}</span></div>
      <div><span class="ds-ship-l">Ship Date:</span><span>${esc(shipDate)}</span></div>
    </div>
    <table class="ds-totals">${rowsHtml(upper)}${taxRowsHtml(data, fmt)}${rowsHtml(upperTail)}</table>
  </section>
  <div class="ds-rule"></div>
  <table class="ds-totals ds-grand">${rowsHtml(lower)}</table>
  ${showBalances ? `
  <div class="ds-credit">Available Store Credit: ${fmt(after < 0 ? Math.abs(after) : 0)}</div>
  <div class="ds-balance">
    <span>Previous Due Balance: ${balanceText(prev)}</span>
    <span>Total Due Balance: ${balanceText(after)}</span>
  </div>` : '<div class="ds-balance-gap"></div>'}
  ${policy('Notes', notesHtml)}
  ${policy('Terms &amp; Conditions', termsHtml)}
  ${policy('General Policy', plain(settings.generalPolicy), true)}
  ${policy('Return Policy', plain(settings.returnPolicy), true)}
  ${policy('Buyers Guarantee', plain(settings.buyersGuarantee), true)}
  <div class="ds-spacer"></div>
  <div class="ds-sign"><div class="ds-sign-line"></div>Date &amp; Signature</div>`
}

/** Height (u) of the totals → signature block on the last page — mirrors the CSS below. */
function summaryHeightU(data: PrintInvoiceData, ctx: DistributorPrintContext): number {
  const taxCount =
    (data.taxLines || []).reduce((n, l) => n + 1 + Math.max(0, (l.components?.length || 0) - 1), 0) ||
    (Number(data.tax) > 0 ? 1 : 0)
  const upperRows = 3 + taxCount + (Number(data.discount) > 0 ? 1 : 0) + (Number(data.serviceCharge) > 0 ? 1 : 0)
  const lowerRows = ctx.isQuotation ? 1 : 3
  const showBalances = !ctx.isQuotation
  let h = 10 + Math.max(27, upperRows * 16) + 11 + 12 + lowerRows * 18 + (showBalances ? 50 : 10)
  const settings = getActiveDistributorSettings()
  const optional = [data.notes, data.termsAndConditions].filter((b) => b && String(b).trim()).map(String)
  const blocks = [...optional, settings.generalPolicy, settings.returnPolicy, settings.buyersGuarantee]
  blocks.forEach((b, i) => {
    h += (i === 0 ? 3 : 7) + 10 + (b ? 10 * textLines(b, 190) : 0)
  })
  return h + 18 // signature line + caption
}

function pageFooter(page: number, total: number): string {
  const texts = getActivePrintDesign().texts
  return `
  <footer class="ds-foot">
    <span>Page ${page} of ${total}</span>
    <span class="ds-foot-thanks">${esc(texts.thankYou || 'Thank You For Your Business!')}</span>
    <span>${esc(texts.footerLine || 'Powered by Logix Plus')}</span>
  </footer>`
}

function continuationStrip(title: string, ctx: DistributorPrintContext, page: number, total: number, customer: string): string {
  return `
  <div class="ds-cont">
    <div><strong>${esc(title)} : ${esc(ctx.printNumber)}</strong> — continued (page ${page} of ${total})</div>
    <div dir="auto">${esc(customer)}</div>
  </div>`
}

/** Builds the sheets (each one `.invoice-print-page`) for one invoice. */
export function buildDistributorPages(data: PrintInvoiceData, ctx: DistributorPrintContext, sheet: SheetKey): string[] {
  const fmt = (n: number) => formatMoneyWithMeta(n, data.currencyMeta ?? FALLBACK_CURRENCY)
  const title = documentTitle(ctx.isQuotation)
  const fixed = typeof data.a4ItemsPerPage === 'number' && data.a4ItemsPerPage > 0 ? Math.min(120, Math.floor(data.a4ItemsPerPage)) : undefined
  const chunks = paginate(data.items || [], SHEETS[sheet].heightU, firstPageTopU(data, ctx), summaryHeightU(data, ctx), fixed)
  const customer = partyName(data, ctx.nativeNames)
  let start = 0
  return chunks.map((rows, i) => {
    const first = i === 0
    const last = i === chunks.length - 1
    const html = `
<div class="invoice-print-page ds-page">
  ${first
    ? `${letterhead(data, ctx, title)}
  <section class="ds-parties">${partyBlock('SOLD TO:', data, ctx)}${partyBlock('SHIP TO:', data, ctx)}</section>
  ${termsBand(data, ctx)}`
    : continuationStrip(title, ctx, i + 1, chunks.length, customer)}
  ${itemsTable(rows, start, fmt, ctx.nativeNames)}
  ${last ? summary(data, ctx, fmt) : '<div class="ds-spacer"></div>'}
  ${pageFooter(i + 1, chunks.length)}
</div>`
    start += rows.length
    return html
  })
}

function distributorCss(sheet: SheetKey, layout: Layout): string {
  const g = SHEETS[sheet]
  const c = getActivePrintColors()
  const band = c.tableHeaderBg || '#dee0e3'
  const bandText = c.tableHeaderText || '#000'
  const balanceBg = c.footerBg || '#808080'
  const balanceText = c.footerText || '#fff'
  const pageBg = c.pageBg || '#fff'
  const half = layout !== 'single'
  // Half-sheet layouts put an A5-sized page into one half of a landscape A4 sheet.
  const pageCss = half ? 'A4 landscape' : `${g.widthMm}mm ${g.heightMm}mm`
  const u = (n: number) => `calc(${n} * var(--u))`
  return `
    @page { size: ${pageCss}; margin: 0; }
    #invoice-print-root, #invoice-print-root * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    body { background: #e5e7eb; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #invoice-print-root { --u: ${g.unit}pt; background: transparent !important;
      font-family: 'Poppins', ${printScriptFontFamilies()}, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
    .ds-row { display: flex; width: 297mm; margin: 0 auto; }
    .ds-row > .ds-slot { width: 148.5mm; }
    .ds-page {
      position: relative; display: flex; flex-direction: column;
      width: ${g.widthMm}mm; min-height: ${g.heightMm - 0.5}mm; margin: 0 auto;
      padding: ${u(20)} 0 0; background: ${pageBg}; overflow: hidden;
      font-size: ${u(8)}; line-height: 1.5; text-align: left;
    }
    .ds-page, .ds-page * { letter-spacing: 0; }

    /* letterhead */
    .ds-head { display: grid; grid-template-columns: 1fr ${u(120)} 1fr; column-gap: ${u(10)}; padding: 0 ${u(20)}; align-items: start; }
    .ds-co { font-weight: 600; line-height: ${u(13.2)}; min-width: 0; overflow-wrap: anywhere; }
    .ds-co-name { font-weight: 600; }
    .ds-logo-slot { display: flex; justify-content: center; }
    .ds-logo { max-width: ${u(120)}; max-height: ${u(97)}; object-fit: contain; display: block; }
    .ds-doc { justify-self: end; width: ${u(151)}; font-weight: 600; }
    .ds-title { font-size: ${u(16)}; line-height: ${u(24)}; font-weight: 600; overflow-wrap: anywhere; }
    .ds-number { font-size: ${u(16)}; line-height: ${u(24)}; font-weight: 600; white-space: nowrap; }
    .ds-barcode { font-family: 'Libre Barcode 39', monospace; font-weight: 400; line-height: 1.15; height: 1.15em; white-space: nowrap; overflow: hidden; }
    .ds-meta { line-height: ${u(12)}; margin-top: ${u(1)}; overflow-wrap: anywhere; }

    /* sold to / ship to */
    .ds-parties { display: grid; grid-template-columns: minmax(0, 1fr) ${u(146)}; column-gap: ${u(24)}; padding: 0 ${u(20)}; margin-top: ${u(14)}; }
    .ds-party { line-height: ${u(12)}; min-width: 0; overflow-wrap: anywhere; max-width: ${u(260)}; }
    .ds-party:last-child { max-width: none; }
    .ds-label-box { display: inline-block; min-width: ${u(50)}; height: ${u(15)}; line-height: ${u(15)}; background: ${band}; color: ${bandText};
      font-size: ${u(10)}; font-weight: 600; white-space: nowrap; padding-right: ${u(3)}; }

    /* terms band */
    .ds-terms { margin-top: ${u(4)}; }
    .ds-terms-head, .ds-terms-body { display: grid; grid-template-columns: 21.24% 20.42% 16.34% 11.44% 17.97% 1fr; padding-left: 3.27%; }
    .ds-terms-head { background: ${band}; color: ${bandText}; border-top: 0.5pt solid #000; border-bottom: 0.5pt solid #000;
      font-size: ${u(10)}; font-weight: 600; line-height: ${u(14)}; padding-top: ${u(2.5)}; padding-bottom: ${u(2)}; }
    .ds-terms-body { line-height: ${u(12)}; padding-top: ${u(1)}; }
    .ds-terms-head > div, .ds-terms-body > div { min-width: 0; padding-right: ${u(6)}; overflow-wrap: anywhere; }
    .ds-terms-head > div:nth-child(5), .ds-terms-body > div:nth-child(5) { text-align: center; padding-right: 0; }

    /* items */
    .ds-items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: ${u(11.5)}; }
    .ds-items th { background: ${band}; color: ${bandText}; font-size: ${u(10)}; font-weight: 600; line-height: ${u(14)};
      padding: ${u(1)} 0 ${u(3)}; border-top: 0.5pt solid #000; border-bottom: 0.5pt solid #000; text-align: left; white-space: nowrap; }
    .ds-items td { padding: ${u(2)} 0; line-height: ${u(12)}; vertical-align: top; overflow-wrap: anywhere; }
    .ds-items tr.ds-zebra td { background: #f2f2f2; }
    .ds-c-no { padding-left: ${u(6)} !important; }
    .ds-c-name { padding-right: ${u(8)} !important; }
    .ds-c-upc { padding-right: ${u(4)} !important; }
    .ds-items .ds-c-qty { text-align: center; }
    .ds-items .ds-c-num { text-align: right; padding-right: ${u(2)}; }
    .ds-items th:last-child, .ds-items td:last-child { padding-right: ${u(12)}; }
    .ds-sub { font-size: ${u(7)}; color: #555; line-height: ${u(12)}; }
    .ds-strike { font-size: ${u(7)}; color: #777; text-decoration: line-through; }

    /* totals */
    .ds-summary { display: flex; justify-content: space-between; align-items: flex-start; padding: 0 ${u(12)} 0 ${u(20)}; margin-top: ${u(10)}; }
    .ds-ship { font-size: ${u(9)}; line-height: ${u(13.5)}; }
    .ds-ship-l { display: inline-block; width: ${u(66)}; height: ${u(14)}; background: ${band}; color: ${bandText}; font-weight: 500; padding-left: ${u(4)}; margin-right: ${u(2)}; }
    .ds-totals { border-collapse: collapse; }
    .ds-totals th { font-size: ${u(10)}; font-weight: 600; text-align: right; padding: 0 ${u(5)} 0 ${u(8)}; line-height: ${u(14)}; height: ${u(16)}; vertical-align: top; white-space: nowrap; }
    .ds-totals td { width: ${u(100)}; font-size: ${u(10)}; font-weight: 500; text-align: right; padding: 0 ${u(8)} 0 0; line-height: ${u(14)}; height: ${u(16)}; vertical-align: top; white-space: nowrap; }
    .ds-totals tr:not(:last-child) td { border-bottom: 0.5pt solid #000; }
    .ds-totals th.ds-indent { font-weight: 400; }
    .ds-rule { margin: ${u(11)} ${u(12)} 0 ${u(20)}; border-top: 0.5pt solid #000; }
    .ds-grand { margin: ${u(12)} ${u(12)} 0 auto; }
    .ds-grand th, .ds-grand td { font-size: ${u(12)}; line-height: ${u(17)}; height: ${u(18)}; }
    .ds-credit { font-size: ${u(10)}; font-weight: 500; line-height: ${u(14)}; padding: 0 ${u(20)}; margin-top: ${u(11)}; }
    .ds-balance { display: flex; justify-content: space-between; gap: ${u(12)}; background: ${balanceBg}; color: ${balanceText};
      font-size: ${u(10)}; font-weight: 600; line-height: ${u(14)}; padding: ${u(5)} ${u(20)}; margin-top: ${u(1)}; }
    .ds-balance-gap { height: ${u(10)}; }

    /* policies, signature, footer */
    .ds-policy { padding: 0 ${u(20)}; margin-top: ${u(3)}; }
    .ds-policy + .ds-policy { margin-top: ${u(7)}; }
    .ds-policy-h { font-size: ${u(6)}; font-weight: 600; line-height: ${u(10)}; }
    .ds-policy-t { font-size: ${u(6)}; line-height: ${u(10)}; text-align: justify; overflow-wrap: anywhere; }
    .ds-policy-t p, .ds-policy-t ul, .ds-policy-t ol { margin: 0; }
    .ds-policy-t ul, .ds-policy-t ol { padding-left: ${u(12)}; }
    .ds-spacer { flex: 1 1 auto; min-height: ${u(16)}; }
    .ds-sign { align-self: flex-end; width: ${u(120)}; margin-right: ${u(12)}; text-align: center; line-height: ${u(14)}; break-inside: avoid; }
    .ds-sign-line { border-top: 0.5pt solid #000; margin-bottom: ${u(3)}; }
    .ds-foot { display: flex; justify-content: space-between; align-items: flex-start; margin: ${u(15)} ${u(20)} 0; padding: ${u(5)} 0 ${u(12)};
      border-top: 0.5pt solid #d4d4d4; font-size: ${u(9)}; line-height: ${u(12.6)}; }
    .ds-foot-thanks { margin-top: ${u(-9)}; background: ${pageBg}; padding: 0 ${u(4)}; }
    .ds-cont { display: flex; justify-content: space-between; gap: ${u(12)}; padding: 0 ${u(20)} ${u(4)}; font-size: ${u(9)}; line-height: ${u(13)}; }

    @media screen {
      body { padding: 16px 0; }
      .ds-page { box-shadow: 0 2px 12px rgba(0,0,0,.18); }
      .ds-page + .ds-page, .ds-row + .ds-row { margin-top: 16px; }
      .ds-row .ds-page { box-shadow: none; }
      .ds-row { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
      .ds-row > .ds-slot + .ds-slot { border-left: 1px dashed #bbb; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .no-print { display: none !important; }
      .ds-page, .ds-row { break-after: page; page-break-after: always; }
      .ds-row .ds-page { break-after: auto; page-break-after: auto; }
      .ds-page:last-child, .ds-row:last-child { break-after: auto; page-break-after: auto; }
    }
    html[dir="rtl"] .ds-page { direction: ltr; }
  `
}

function documentShell(sheet: SheetKey, layout: Layout, title: string, bodyHtml: string, ctx: DistributorPrintContext): string {
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} ${esc(ctx.printNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
    /* @import (not <link>) so the fonts travel with the CSS when the WhatsApp PDF is built in the main window */
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Libre+Barcode+39${printScriptFontParams()}&display=swap');
    ${ctx.printActionsCss}
    ${distributorCss(sheet, layout)}
  </style>
</head>
<body>
  <div id="invoice-print-root">
  ${bodyHtml}
  </div>
  ${ctx.printActionsHtml}
</body>
</html>`
}

/** Full print document for one invoice on A4 / A5 / A5 landscape / half of a landscape A4. */
export function generateDistributorInvoiceHTML(data: PrintInvoiceData, sheetSize: SheetSize, ctx: DistributorPrintContext): string {
  const layout: Layout = sheetSize === 'a4-half-left' ? 'half-left' : sheetSize === 'a4-half-right' ? 'half-right' : 'single'
  const sheet: SheetKey = layout !== 'single' ? 'a5' : (sheetSize as SheetKey)
  const pages = buildDistributorPages(data, ctx, sheet)
  const title = documentTitle(ctx.isQuotation)
  const body =
    layout === 'single'
      ? pages.join('')
      : pages
          .map((p) =>
            layout === 'half-left'
              ? `<div class="ds-row"><div class="ds-slot">${p}</div><div class="ds-slot"></div></div>`
              : `<div class="ds-row"><div class="ds-slot"></div><div class="ds-slot">${p}</div></div>`,
          )
          .join('')
  return documentShell(sheet, layout, title, body, ctx)
}

/** Two different invoices side by side on landscape A4 sheets (A5-sized each), page by page. */
export function generateDistributorTwoUpHTML(
  left: { data: PrintInvoiceData; ctx: DistributorPrintContext },
  right: { data: PrintInvoiceData; ctx: DistributorPrintContext },
): string {
  const l = buildDistributorPages(left.data, left.ctx, 'a5')
  const r = buildDistributorPages(right.data, right.ctx, 'a5')
  const rows = Array.from({ length: Math.max(l.length, r.length) }, (_, i) =>
    `<div class="ds-row"><div class="ds-slot">${l[i] ?? ''}</div><div class="ds-slot">${r[i] ?? ''}</div></div>`,
  ).join('')
  return documentShell('a5', 'half-left', documentTitle(left.ctx.isQuotation), rows, left.ctx)
}

/**
 * For documents that reuse the shared invoice markup (purchase invoices, payment receipts)
 * while the branch is set to Distributor: same typeface, grey bands and rules.
 */
export const DISTRIBUTOR_OVERLAY_CSS = `
  body { font-family: 'Poppins', 'Inter', system-ui, sans-serif; color: #000; }
  .invoice-header { border-bottom: 0.5pt solid #000; }
  .company-name, .invoice-title { color: #000; font-weight: 600; }
  .invoice-title { text-transform: uppercase; }
  .invoice-info { background: none; border-radius: 0; padding-left: 0; padding-right: 0; }
  .info-title { display: inline-block; background: #dee0e3; color: #000; padding: 0 6px; border: none; font-weight: 600; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .items-table { border: none; box-shadow: none; border-radius: 0; }
  .items-table th { background: #dee0e3; color: #000; font-weight: 600; border: none; border-top: 0.5pt solid #000; border-bottom: 0.5pt solid #000; border-radius: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .items-table td { border: none; }
  .items-table tbody tr:nth-child(even) { background: #f2f2f2; }
  .totals-table { border: none; border-radius: 0; }
  .totals-table td { border-bottom: 0.5pt solid #000; }
  .totals-table .total-label { background: none !important; font-weight: 600; border-right: none; }
  .totals-wrapper:not(:has(~ .totals-wrapper)) .totals-table tr:last-child td { background: #808080 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .footer { border-top: 0.5pt solid #d4d4d4; }
`
