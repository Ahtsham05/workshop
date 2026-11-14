/**
 * "Distributor" invoice layout — a US wholesale invoice: centred logo, "INVOICE : number"
 * with a Code 128 barcode of the invoice number, date / due date and any licence numbers the branch entered, Sold To,
 * a Terms · Status · Invoiced By · Tax ID band, UPC / Qty / Unit Price / Sold Price
 * (+ Tax when charged) / Amount columns, totals, a grey balance band, the policies and terms
 * that have text, a signature line and a page footer. Anything not entered is left out.
 *
 * Unlike the other templates (CSS overlays on one shared HTML structure, see
 * invoice-template.ts) this one has its own markup, so it is generated here. It still emits
 * `#invoice-print-root` > `.invoice-print-page` sheets, one per physical page, so the print
 * window's Save PDF / WhatsApp send capture it page by page exactly like every other layout.
 *
 * All sizes are written in `--u` units (1pt on A4) so the same layout scales down for A5.
 */
import JsBarcode from 'jsbarcode'
import { escapeHtml } from '@/lib/escape-html'
import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import { invoiceTermsToSafeHtml } from '@/lib/rich-text-utils'
import { format as formatPattern } from 'date-fns'
import { toBusinessWallClock } from '@/lib/business-timezone'
import { getActivePrintColors } from '@/lib/print-colors'
import { getActivePrintDesign } from '@/lib/print-design'
import { printScriptFontFamilies, printScriptFontParams } from '@/lib/native-language'
import { formatImeiEntries } from '@/stores/imei.api'
import { buildTaxBreakdownHtml } from '@/lib/tax-print-rows'
import type { PrintInvoiceData } from './print-utils'
import {
  DISTRIBUTOR_LICENSE_FIELDS,
  getActiveDistributorSettings,
  pickedPrintHeaderStyle,
  withDistributorSettings,
  type DistributorHeaderStyle,
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

/** Code 128 encodes printable ASCII exactly as typed (case kept), so a scanner reads back the
 *  real invoice number; anything outside ASCII becomes '-' rather than a broken barcode. */
const barcodeSafe = (value: string) => value.trim().replace(/[^\x20-\x7e]/g, '-')

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

/** A sales-return print (see print-utils' `salesReturn`). */
const isReturn = (data: PrintInvoiceData) => Boolean(data.salesReturn)

const REFUND_METHODS: Record<string, string> = {
  cash: 'Cash',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  adjustment: 'Account Credit',
}
const refundMethodText = (data: PrintInvoiceData) => {
  const m = data.salesReturn?.refundMethod || ''
  return REFUND_METHODS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '-')
}
const returnStatusText = (data: PrintInvoiceData) => {
  const st = data.salesReturn?.status || 'approved'
  return st.charAt(0).toUpperCase() + st.slice(1)
}
const isoDateText = (iso?: string) => {
  if (!iso) return ''
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return shortDay(day ? d : toBusinessWallClock(d))
}

function documentTitle(isQuotation: boolean, salesReturn = false): string {
  if (salesReturn) return 'RETURN INVOICE'
  if (isQuotation) return 'QUOTATION'
  return getActivePrintDesign().texts.title || 'INVOICE'
}

/* ── Pagination ─────────────────────────────────────────────────────────────
 * Rows are split into whole sheets up front (never mid-row), by estimated height. Every
 * height below is in `u` and mirrors the CSS further down.
 */
const ROW_BASE_U = 4
const LINE_U = 12
const PAGE_TOP_PAD_U = 20
const TABLE_HEAD_U = 31 // gap above the table + heading row
const CONT_HEAD_U = 70 // continuation letterhead (business, customer, address | barcode, dates)
const NEXT_PAGE_TOP_U = PAGE_TOP_PAD_U + CONT_HEAD_U + TABLE_HEAD_U
const FOOTER_U = 62 // spacer + page footer
const SAFETY_U = 8 // rounding / font-metric slack, so a sheet never spills onto a blank page
const NAME_CHARS_PER_LINE = 50 // with the name column at 38.2% (SKU + Tax both shown)

type Item = PrintInvoiceData['items'][number]

/** Which optional columns this invoice needs — SKU only when a product has a code, Tax only when
 *  charged, Sold Price only on sales (a return line has one price). */
interface Columns { sku: boolean; tax: boolean; sold: boolean }
function columnsFor(items: Item[], salesReturn = false): Columns {
  return {
    sku: items.some((it) => (it.code || '').trim()),
    tax: items.some((it) => (Number(it.taxAmount) || 0) > 0),
    sold: !salesReturn,
  }
}
/** Name column width in % — Sunrise proportions; it takes whatever an omitted column leaves. */
const nameColumnPct = (cols: Columns) => 60 - (cols.sku ? 13.8 : 0) - (cols.tax ? 8 : 0) + (cols.sold ? 0 : 10)

function itemLines(item: Item, cols: Columns): number {
  const perLine = Math.floor((NAME_CHARS_PER_LINE * nameColumnPct(cols)) / 38.2)
  let lines = Math.max(1, Math.ceil((item.name || '').length / perLine))
  if (item.imeis && item.imeis.length > 0) lines += 1
  if ((item.code || '').length > 16) lines = Math.max(lines, Math.ceil(item.code!.length / 16))
  return lines
}
const itemHeight = (item: Item, cols: Columns) => ROW_BASE_U + LINE_U * itemLines(item, cols)

function textLines(html: string, charsPerLine: number): number {
  const plain = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  return plain.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

function paginate(items: Item[], cols: Columns, pageHeightU: number, firstTopU: number, summaryU: number, fixedPerPage?: number): Item[][] {
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
    const h = itemHeight(item, cols)
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
  const lastUsed = last.reduce((s, it) => s + itemHeight(it, cols), 0)
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

/* Dates print like the reference invoice: "27 Jan 26 12:47:00 PM" (due date without seconds). */
const DAY_PATTERN = 'dd MMM yy'
const shortDay = (d: Date) => formatPattern(d, DAY_PATTERN)

/**
 * The invoice's moment for the header. The DATE is always the invoice's own date (never the day
 * it was saved or printed). The time of day is the moment it was entered (`invoiceDateTime` =
 * createdAt), in the business time zone — but only when it was entered ON that date; a back-dated
 * invoice (dated 03 Oct, keyed in on 14 Nov) prints the date alone rather than a time from
 * another day.
 */
function invoiceMoment(data: PrintInvoiceData, ctx: DistributorPrintContext): { at: Date; hasTime: boolean } {
  const day = ctx.documentDate
  const entered = data.invoiceDateTime ? new Date(data.invoiceDateTime) : null
  if (!entered || Number.isNaN(entered.getTime())) return { at: day, hasTime: false }
  const wall = toBusinessWallClock(entered)
  const sameDay =
    wall.getFullYear() === day.getFullYear() && wall.getMonth() === day.getMonth() && wall.getDate() === day.getDate()
  return sameDay ? { at: wall, hasTime: true } : { at: day, hasTime: false }
}

function dateText(data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  const { at, hasTime } = invoiceMoment(data, ctx)
  return formatPattern(at, hasTime ? `${DAY_PATTERN} h:mm:ss a` : DAY_PATTERN)
}

/** Invoices with a due date only (not quotations/returns) — no due date, no line. The due date
 * is a calendar day and carries the invoice's time of day, as on the reference. */
function dueDateText(data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  if (ctx.isQuotation || isReturn(data)) return ''
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data.dueDate || ''))
  if (!day) return ''
  const { at, hasTime } = invoiceMoment(data, ctx)
  const due = new Date(at.getTime())
  due.setFullYear(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  return formatPattern(due, hasTime ? `${DAY_PATTERN} h:mm a` : DAY_PATTERN)
}

/** Date, due date and only the licence numbers the branch entered in Settings → Printing. */
function metaLines(data: PrintInvoiceData, ctx: DistributorPrintContext): string[] {
  const settings = getActiveDistributorSettings()
  const due = dueDateText(data, ctx)
  // "Without logo" prints nothing about the business, licence numbers included.
  const licences = (showsCompany() ? DISTRIBUTOR_LICENSE_FIELDS : []).map(({ key, label }) => {
    // The organisation's tax number stands in for an empty State Tax Id.
    const value = settings[key] || (key === 'stateTaxId' ? data.companyTaxNumber?.trim() : '')
    return value ? `${label}: ${esc(value)}` : ''
  })
  const ret = data.salesReturn
  const originalDate = isoDateText(ret?.originalInvoiceDate)
  return [
    `Date: ${esc(dateText(data, ctx))}`,
    due && `Due Date: ${esc(due)}`,
    // A return names the invoice the goods came from.
    ret?.originalInvoiceNumber && `Invoice No: ${esc(ret.originalInvoiceNumber)}`,
    ret && originalDate && `Invoice Date: ${esc(originalDate)}`,
    ...licences,
    // Only when the branch turned on Settings → Warehouses → "Show on prints".
    ctx.warehouseLabel && `${esc(ctx.warehouseWord)}: ${ctx.warehouseLabel}`,
  ].filter((l): l is string => Boolean(l))
}

/** Printed lines of the meta block once it wraps in its 205u column (~42 SemiBold 8pt chars). */
const metaLineCount = (lines: string[]) =>
  lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/&[a-z#0-9]+;/gi, '_').length / 42)), 0)

function partyLines(data: PrintInvoiceData, native: boolean): string[] {
  const address = (data.customerAddress || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const phone = data.customerPhone?.trim()
  return [
    `<div class="ds-party-name" dir="auto">${esc(partyName(data, native))}</div>`,
    ...address.map((l) => `<div dir="auto">${esc(l)}</div>`),
    phone ? `<div>Phone: <bdi dir="ltr">${esc(phone)}</bdi></div>` : '',
    data.customerEmail ? `<div>${esc(data.customerEmail)}</div>` : '',
  ].filter(Boolean)
}

/* ── Header style (Settings → Printing → Distributor details) ─────────────── */
const headerStyle = (): DistributorHeaderStyle => getActiveDistributorSettings().headerStyle
/** Business name / address / contact, licence numbers, business policies and the Terms ·
 *  Status · Invoiced By · Tax ID band — all left off on "Without logo". */
const showsCompany = () => headerStyle() !== 'no-logo'

const hasLogo = (data: PrintInvoiceData) => headerStyle() === 'logo' && Boolean(data.companyLogo || data.isTrial)
/* ── Barcode ──────────────────────────────────────────────────────────────
 * A real Code 128 of the invoice number drawn as SVG bars (JsBarcode), so any scanner reads back
 * exactly the number printed next to it. Code 128 is the standard for documents: much shorter
 * than Code 39 for the same number (digit runs pack two per symbol), so the bars come out
 * thicker and scan reliably. Width follows the real module count at 0.75u per module (≈0.26mm
 * on A4, the usual 10-mil minimum), capped by the column. No human-readable line under the bars:
 * the number is already printed right above them ("INVOICE : …"). Vector bars stay sharp in print/PDF.
 */
const BARCODE_H_U = 18
const BARCODE_TEXT_U = 10 // line height of the number shown instead of bars when they can't be drawn
const BARCODE_U_PER_MODULE = 0.75

type DrawnBarcode = { svg: SVGSVGElement; modules: number }
const barcodeCache = new Map<string, DrawnBarcode | null>()

function drawBarcode(value: string): DrawnBarcode | null {
  if (barcodeCache.has(value)) return barcodeCache.get(value)!
  let drawn: DrawnBarcode | null = null
  if (typeof document !== 'undefined') {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svg, value, { format: 'CODE128', width: 1, height: 40, margin: 0, displayValue: false, background: '#ffffff', lineColor: '#000000' })
      // Drop JsBarcode's background <rect>: the page is already white, and a background some print
      // pipelines cannot read (e.g. fill="transparent" in Chrome's black-and-white printing) is
      // painted black over every bar. Only the bar group (explicit black fill) is kept.
      svg.querySelectorAll(':scope > rect').forEach((r) => r.remove())
      const modules = parseFloat(svg.getAttribute('width') || '0')
      if (modules > 0) drawn = { svg, modules }
    } catch {
      /* no barcode */
    }
  }
  barcodeCache.set(value, drawn)
  return drawn
}

/** Code 128 module count: start 11 + 11 per symbol + check 11 + stop 13 (estimate when no DOM). */
const barcodeModules = (value: string) => drawBarcode(value)?.modules ?? 35 + value.length * 11
const barcodeWidthU = (value: string, maxU: number) => Math.min(maxU, barcodeModules(value) * BARCODE_U_PER_MODULE)

function barcodeHtml(value: string, maxWidthU: number, heightU = BARCODE_H_U, withText = false): string {
  if (!value) return ''
  const widthU = barcodeWidthU(value, maxWidthU)
  const width = `calc(${widthU.toFixed(2)} * var(--u))`
  const height = `calc(${heightU} * var(--u))`
  const drawn = drawBarcode(value)
  let bars = ''
  if (drawn) {
    const svg = drawn.svg.cloneNode(true) as SVGSVGElement
    svg.setAttribute('viewBox', `0 0 ${drawn.modules} 40`)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.removeAttribute('style')
    svg.setAttribute('class', 'ds-barcode-svg')
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', `Barcode ${value}`)
    svg.setAttribute('style', `width:${width};height:${height}`)
    bars = svg.outerHTML
  }
  // Without a DOM to draw into, the number alone still prints (never fake bars).
  if (!bars) return `<div class="ds-barcode-text" style="width:${width}">${esc(value)}</div>`
  if (!withText) return bars
  return `<div class="ds-barcode-box" style="width:${width}">${bars}<div class="ds-barcode-text">${esc(value)}</div></div>`
}

/* "INVOICE : number" on one 16u line; a long title/number shrinks the line to fit
 * (Poppins SemiBold capitals/digits average ~0.62em, the column is at most 205u wide). */
const DOC_COL_U = 205
const HEADING_U = 16
const headingSizeU = (text: string) => Math.min(HEADING_U, DOC_COL_U / Math.max(1, text.length * 0.62))

/** Height (u) of everything above the first item row on page 1 — mirrors the CSS below. */
function firstPageTopU(data: PrintInvoiceData, ctx: DistributorPrintContext): number {
  const co = showsCompany() ? companyLines(data, ctx.nativeNames).length * 13.2 : 0
  const logo = hasLogo(data) ? 97 : 0
  const heading = 24 // "INVOICE : number" line
  const doc = heading + (barcodeSafe(ctx.printNumber) ? BARCODE_H_U + 4 : 0) + metaLineCount(metaLines(data, ctx)) * 12
  const parties = 14 + 15 + partyLines(data, ctx.nativeNames).length * 12
  const terms = showsCompany() ? 4 + 19.5 + 13 : 0
  return PAGE_TOP_PAD_U + Math.max(co, logo, doc) + parties + terms + TABLE_HEAD_U
}

function letterhead(data: PrintInvoiceData, ctx: DistributorPrintContext, title: string): string {
  const native = ctx.nativeNames
  const company = (native ? data.companyNameUrdu || data.companyName : data.companyName || data.companyNameUrdu) || ''

  const logo = !hasLogo(data)
    ? ''
    : data.companyLogo
      ? `<img class="ds-logo" src="${esc(data.companyLogo)}" alt="${esc(company)}" />`
      : `<img class="ds-logo" src="/images/logo-light.png" alt="Logix Plus solutions" />`

  const barcodeValue = barcodeSafe(ctx.printNumber)
  // Title and number on one line (then the barcode).
  const headingText = `${title} : ${ctx.printNumber}`
  const heading = `<div class="ds-title" style="font-size:calc(${headingSizeU(headingText).toFixed(2)} * var(--u))">${esc(headingText)}</div>`

  const meta = metaLines(data, ctx)

  // Left column: the business (empty on "Without logo"); the logo slot only takes room when a
  // logo prints, so the business details get the full width otherwise.
  const left = `<div class="ds-co">${showsCompany() ? companyLines(data, native).join('') : ''}</div>`

  return `
  <header class="ds-head${logo ? '' : ' ds-head-nologo'}">
    ${left}
    ${logo ? `<div class="ds-logo-slot">${logo}</div>` : ''}
    <div class="ds-doc">
      ${heading}
      ${barcodeValue ? `<div class="ds-barcode-row">${barcodeHtml(barcodeValue, DOC_COL_U, BARCODE_H_U)}</div>` : ''}
      <div class="ds-meta">${meta.map((m) => `<div>${m}</div>`).join('')}</div>
    </div>
  </header>`
}

function partyBlock(label: string, data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  return `<div class="ds-party"><div class="ds-label-box">${label}</div>${partyLines(data, ctx.nativeNames).join('')}</div>`
}

function termsBand(data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  const taxId: [string, string] = ['Tax ID/Hemp', `${data.customerTaxNumber?.trim() || '-'}/-`]
  const cells: Array<[string, string]> = isReturn(data)
    ? [
        ['Refund Method', refundMethodText(data)],
        ['Status', returnStatusText(data)],
        ['Returned By', data.invoicedBy?.trim() || '-'],
        ['Invoice No', data.salesReturn?.originalInvoiceNumber?.trim() || '-'],
        taxId,
      ]
    : [
        ['Terms', termsText(data, ctx.isQuotation)],
        ['Status', statusText(data, ctx.isQuotation)],
        // How it was paid ("Check #10234") — only once money was actually collected.
        ...(!ctx.isQuotation && data.paymentLabel?.trim() && Number(data.paidAmount) > 0
          ? [['Paid By', data.paymentLabel.trim()] as [string, string]]
          : []),
        ['Invoiced By', data.invoicedBy?.trim() || '-'],
        taxId,
      ]
  const grid = cells.length === 5 ? 'grid-template-columns:17% 15% 19% 19% 1fr' : ''
  return `
  <div class="ds-terms">
    <div class="ds-terms-head" style="${grid}">${cells.map(([h]) => `<div>${h}</div>`).join('')}</div>
    <div class="ds-terms-body" style="${grid}">${cells.map(([, v]) => `<div dir="auto">${esc(v)}</div>`).join('')}</div>
  </div>`
}

function itemsTable(rows: Item[], startIndex: number, fmt: (n: number) => string, native: boolean, cols: Columns): string {
  const span = 5 + (cols.sku ? 1 : 0) + (cols.tax ? 1 : 0) + (cols.sold ? 1 : 0)
  const body = rows.length
    ? rows
        .map((item, i) => {
          const name = native ? item.nameUrdu?.trim() || item.name : item.name
          const qty = Number(item.quantity) || 0
          const unit = item.unit && !/^(pcs?|piece|pieces|unit|units|nos?)$/i.test(item.unit.trim()) ? ` ${esc(item.unit)}` : ''
          const unitPrice = Number(item.unitPrice) || 0
          const amount = Number(item.subtotal) || 0
          // Sold Price is what each unit actually went for once its line discount is taken off.
          const soldPrice = qty > 0 && item.discountAmount ? amount / qty : unitPrice
          const extra = item.imeis && item.imeis.length > 0
            ? `<div class="ds-sub">IMEI/Serial: ${esc(formatImeiEntries(item.imeis))}</div>`
            : ''
          return `
      <tr${(startIndex + i) % 2 === 1 ? ' class="ds-zebra"' : ''} data-sub="${amount}">
        <td class="ds-c-no">${startIndex + i + 1}</td>
        ${cols.sku ? `<td class="ds-c-upc">${esc(item.code || '')}</td>` : ''}
        <td class="ds-c-name" dir="auto">${esc(name)}${extra}</td>
        <td class="ds-c-qty">${qty}${unit}</td>
        <td class="ds-c-num">${fmt(unitPrice)}</td>
        ${cols.sold ? `<td class="ds-c-num">${fmt(soldPrice)}</td>` : ''}
        ${cols.tax ? `<td class="ds-c-num">${fmt(Number(item.taxAmount) || 0)}</td>` : ''}
        <td class="ds-c-num">${fmt(amount)}</td>
      </tr>`
        })
        .join('')
    : `<tr><td></td><td class="ds-c-name" colspan="${span - 1}">No items</td></tr>`
  const widths = [3.3, ...(cols.sku ? [13.8] : []), nameColumnPct(cols), 6.5, 10.5, ...(cols.sold ? [10] : []), ...(cols.tax ? [8] : []), 9.7]
  return `
  <table class="ds-items">
    <colgroup>${widths.map((w) => `<col style="width:${w.toFixed(2)}%">`).join('')}</colgroup>
    <thead>
      <tr>
        <th></th>${cols.sku ? '<th class="ds-c-upc">UPC</th>' : ''}<th class="ds-c-name">Product Name / Description</th>
        <th class="ds-c-qty">Qty</th><th class="ds-c-num">Unit Price</th>${cols.sold ? '<th class="ds-c-num">Sold Price</th>' : ''}
        ${cols.tax ? '<th class="ds-c-num">Tax</th>' : ''}<th class="ds-c-num">Amount</th>
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

/** Notes / Terms & Conditions / policies that have text, in print order — empty ones are left out. */
function policyBlocks(data: PrintInvoiceData): Array<{ heading: string; html: string }> {
  const settings = getActiveDistributorSettings()
  const plain = (text: string) => (text ? escapeHtml(text).replace(/\r?\n/g, '<br />') : '')
  const rich = (text: unknown) => (text && String(text).trim() ? invoiceTermsToSafeHtml(String(text)) : '')
  // "Without logo" leaves the business's own policies off; the invoice's Terms & Conditions stay.
  const policies = showsCompany()
  // A return only needs the policy that governs it.
  if (isReturn(data)) return policies ? [{ heading: 'Return Policy', html: plain(settings.returnPolicy) }].filter((b) => b.html) : []
  return [
    { heading: 'Terms &amp; Conditions', html: rich(data.termsAndConditions) },
    ...(policies
      ? [
          { heading: 'General Policy', html: plain(settings.generalPolicy) },
          { heading: 'Return Policy', html: plain(settings.returnPolicy) },
          { heading: 'Buyers Guarantee', html: plain(settings.buyersGuarantee) },
        ]
      : []),
  ].filter((b) => b.html)
}

/** Left-hand grey-label box under the items: shipping on a sale, the original invoice on a return. */
function shipRows(data: PrintInvoiceData, ctx: DistributorPrintContext): Array<[string, string]> {
  const plainHtml = (text?: string) => (text && text.trim() ? escapeHtml(text.trim()).replace(/\r?\n/g, '<br />') : '')
  const ret = data.salesReturn
  if (ret) {
    const reason = plainHtml(ret.reason)
    const condition = plainHtml(ret.damageDescription)
    const originalDate = isoDateText(ret.originalInvoiceDate)
    return [
      ...(ret.originalInvoiceNumber ? [['Invoice No:', esc(ret.originalInvoiceNumber)] as [string, string]] : []),
      ...(originalDate ? [['Invoice Date:', esc(originalDate)] as [string, string]] : []),
      ['Return Date:', esc(shortDay(ctx.documentDate))],
      ...(reason ? [['Reason:', reason] as [string, string]] : []),
      ...(condition ? [['Condition:', condition] as [string, string]] : []),
    ]
  }
  const delivery = Number(data.deliveryCharge) || 0
  const notesHtml = data.notes && String(data.notes).trim() ? invoiceTermsToSafeHtml(String(data.notes)) : ''
  return [
    ['Ship Method:', delivery > 0 ? 'Delivery' : 'In Store Pick Up'],
    ['Ship Date:', esc(shortDay(ctx.documentDate))],
    ...(notesHtml ? [['Notes:', notesHtml] as [string, string]] : []),
  ]
}

/** Grand-total block: Grand Total / Paid / Due on a sale, Return Total + how it was settled on a return. */
function lowerRows(data: PrintInvoiceData, ctx: DistributorPrintContext, fmt: (n: number) => string): Array<[string, string]> {
  const total = Number(data.total) || 0
  if (isReturn(data)) {
    const credited = data.salesReturn?.refundMethod === 'adjustment'
    return [
      ['Return Total', fmt(total)],
      [credited ? 'Credited to Account' : `Refunded (${refundMethodText(data)})`, fmt(total)],
    ]
  }
  if (ctx.isQuotation) return [['Grand Total', fmt(total)]]
  const paid = Number(data.paidAmount) || 0
  return [
    ['Grand Total', fmt(total)],
    ['Total Paid', fmt(paid)],
    ['Due Amount', fmt(Math.max(0, total - paid))],
  ]
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

  // Only amounts that were actually charged print (tax rows come from taxRowsHtml, also only when > 0).
  const upper: Array<[string, string]> = [
    ['Total Quantity', String(Math.round(totalQty * 1000) / 1000)],
    ['Subtotal', fmt(lineTotal)],
    ...(discount > 0 ? [['Discount', `<bdi dir="ltr">-${fmt(discount)}</bdi>`] as [string, string]] : []),
  ]
  const upperTail: Array<[string, string]> = [
    ...(service > 0 ? [['Service Charge', fmt(service)] as [string, string]] : []),
    ...(delivery > 0 ? [['Shipping', fmt(delivery)] as [string, string]] : []),
  ]
  const lower = lowerRows(data, ctx, fmt)
  const rowsHtml = (rows: Array<[string, string]>) =>
    rows.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${v}</td></tr>`).join('')

  const ship = shipRows(data, ctx)

  // Running balance — never on a quotation; on a return only for a registered customer (a
  // walk-in return has no account to show).
  const walkIn = data.customerId === 'walk-in'
  const showBalances = !ctx.isQuotation && !(isReturn(data) && walkIn)
  const prev = walkIn ? 0 : Number(data.previousBalance) || 0
  const after = data.newBalance != null && !walkIn ? Number(data.newBalance) : prev + total - paid
  const balanceText = (n: number) => `${fmt(Math.abs(n))}${n < 0 ? ' (Cr)' : ''}`

  const policies = policyBlocks(data)
    .map((b) => `<div class="ds-policy"><div class="ds-policy-h">${b.heading}</div><div class="ds-policy-t" dir="auto">${b.html}</div></div>`)
    .join('')
  const thanks = getActivePrintDesign().texts.thankYou || 'Thank You For Your Business!'

  return `
  <section class="ds-summary">
    <div class="ds-ship">${ship.map(([l, v]) => `<div class="ds-ship-l">${l}</div><div class="ds-ship-v" dir="auto">${v}</div>`).join('')}</div>
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
  ${policies}
  <div class="ds-sign"><div class="ds-sign-line"></div>Date &amp; Signature</div>
  <div class="ds-thanks">${esc(thanks)}</div>`
}

/** Height (u) of the totals → thank-you block on the last page — mirrors the CSS below. */
function summaryHeightU(data: PrintInvoiceData, ctx: DistributorPrintContext): number {
  const taxCount =
    (data.taxLines || []).reduce((n, l) => n + 1 + Math.max(0, (l.components?.length || 0) - 1), 0) ||
    (Number(data.tax) > 0 ? 1 : 0)
  const upperRows = 2 + (Number(data.tax) > 0 ? taxCount : 0) + (Number(data.discount) > 0 ? 1 : 0) +
    (Number(data.serviceCharge) > 0 ? 1 : 0) + (Number(data.deliveryCharge) > 0 ? 1 : 0)
  const shipU = shipRows(data, ctx).reduce((n, [, v]) => n + textLines(v, 45), 0) * 14
  const lower = lowerRows(data, ctx, String).length
  const balances = !ctx.isQuotation && !(isReturn(data) && data.customerId === 'walk-in')
  let h = 10 + Math.max(shipU, upperRows * 16) + 11 + 12 + lower * 18 + (balances ? 50 : 10)
  policyBlocks(data).forEach((b, i) => {
    h += (i === 0 ? 3 : 7) + 10 + 10 * textLines(b.html, 190)
  })
  return h + 48 + 18 + 30 // gap + signature line/caption + thank-you
}

function pageFooter(page: number, total: number): string {
  const texts = getActivePrintDesign().texts
  return `
  <footer class="ds-foot">
    <span>Page ${page} of ${total}</span>
    ${texts.footerLine ? `<span>${esc(texts.footerLine)}</span>` : ''}
  </footer>`
}

/* Page 2+ header: barcode then ": number" on one line. The barcode keeps page 1's size (any
 * narrower and its bars get too thin to scan); the number shrinks to the room left. */
const CONT_BARCODE_MAX_U = DOC_COL_U
const CONT_COL_U = 320
const contNumberSizeU = (barcodeValue: string, number: string) => {
  const room = CONT_COL_U - (barcodeValue ? barcodeWidthU(barcodeValue, CONT_BARCODE_MAX_U) + 3 : 0)
  return Math.min(14, room / Math.max(1, (number.length + 2) * 0.62))
}

/** Top of every page after the first: business, customer and address | barcode, number and dates. */
function continuationHead(data: PrintInvoiceData, ctx: DistributorPrintContext): string {
  const native = ctx.nativeNames
  const company = showsCompany()
    ? (native ? data.companyNameUrdu || data.companyName : data.companyName || data.companyNameUrdu) || ''
    : ''
  const address = (data.customerAddress || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(', ')
  const barcodeValue = barcodeSafe(ctx.printNumber)
  const due = dueDateText(data, ctx)
  return `
  <header class="ds-cont">
    <div class="ds-cont-l">
      ${company ? `<div dir="auto">${esc(company)}</div>` : ''}
      <div dir="auto">Customer: ${esc(partyName(data, native))}</div>
      ${address ? `<div dir="auto">Address: ${esc(address)}</div>` : ''}
    </div>
    <div class="ds-cont-r">
      <div class="ds-cont-no">${barcodeHtml(barcodeValue, CONT_BARCODE_MAX_U, 16)}<span style="font-size:calc(${contNumberSizeU(barcodeValue, ctx.printNumber).toFixed(2)} * var(--u))">: ${esc(ctx.printNumber)}</span></div>
      <div>Date: ${esc(dateText(data, ctx))}</div>
      ${due ? `<div>Due Date: ${esc(due)}</div>` : ''}
    </div>
  </header>`
}

/** Builds the sheets (each one `.invoice-print-page`) for one invoice. */
export function buildDistributorPages(data: PrintInvoiceData, ctx: DistributorPrintContext, sheet: SheetKey): string[] {
  const fmt = (n: number) => formatMoneyWithMeta(n, data.currencyMeta ?? FALLBACK_CURRENCY)
  const title = documentTitle(ctx.isQuotation, isReturn(data))
  const fixed = typeof data.a4ItemsPerPage === 'number' && data.a4ItemsPerPage > 0 ? Math.min(120, Math.floor(data.a4ItemsPerPage)) : undefined
  const cols = columnsFor(data.items || [], isReturn(data))
  const chunks = paginate(data.items || [], cols, SHEETS[sheet].heightU, firstPageTopU(data, ctx), summaryHeightU(data, ctx), fixed)
  let start = 0
  return chunks.map((rows, i) => {
    const first = i === 0
    const last = i === chunks.length - 1
    const html = `
<div class="invoice-print-page ds-page">
  ${first
    ? `${letterhead(data, ctx, title)}
  <section class="ds-parties">${partyBlock('SOLD TO:', data, ctx)}</section>
  ${showsCompany() ? termsBand(data, ctx) : ''}`
    : continuationHead(data, ctx)}
  ${itemsTable(rows, start, fmt, ctx.nativeNames, cols)}
  ${last ? summary(data, ctx, fmt) : ''}
  <div class="ds-spacer"></div>
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
    .ds-head-nologo { grid-template-columns: 1fr auto; }
    .ds-logo-slot { display: flex; justify-content: center; }
    .ds-logo { max-width: ${u(120)}; max-height: ${u(97)}; object-fit: contain; display: block; }
    /* Pinned to the right margin (mirroring the business details on the left); its lines are
       left-aligned inside it, like the reference invoice. */
    .ds-doc { justify-self: end; width: max-content; max-width: ${u(DOC_COL_U)}; min-width: 0; font-weight: 600; text-align: left; }
    .ds-barcode-row { margin: ${u(1)} 0 ${u(3)}; line-height: 0; }
    .ds-barcode-svg { display: block; }
    .ds-barcode-svg rect, .ds-barcode-svg g { shape-rendering: crispEdges; }
    .ds-barcode-box { line-height: 0; }
    .ds-barcode-text { font-size: ${u(7.5)}; line-height: ${u(BARCODE_TEXT_U)}; height: ${u(BARCODE_TEXT_U)}; font-weight: 500; letter-spacing: ${u(1.2)};
      text-align: center; white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
    .ds-title { font-size: ${u(HEADING_U)}; line-height: ${u(24)}; font-weight: 600; white-space: nowrap; overflow: hidden; text-transform: uppercase; }
    .ds-meta { line-height: ${u(12)}; margin-top: ${u(1)}; overflow-wrap: anywhere; }

    /* sold to / ship to */
    .ds-parties { padding: 0 ${u(20)}; margin-top: ${u(14)}; }
    .ds-party { line-height: ${u(12)}; min-width: 0; overflow-wrap: anywhere; max-width: ${u(300)}; }
    .ds-label-box { display: inline-block; min-width: ${u(50)}; height: ${u(15)}; line-height: ${u(15)}; background: ${band}; color: ${bandText};
      font-size: ${u(10)}; font-weight: 600; white-space: nowrap; padding-right: ${u(3)}; }

    /* terms band */
    .ds-terms { margin-top: ${u(4)}; }
    .ds-terms-head, .ds-terms-body { display: grid; grid-template-columns: 21.24% 20.42% 22% 1fr; padding-left: 3.27%; padding-right: ${u(12)}; }
    .ds-terms-head { background: ${band}; color: ${bandText}; border-top: 0.5pt solid #000; border-bottom: 0.5pt solid #000;
      font-size: ${u(10)}; font-weight: 600; line-height: ${u(14)}; padding-top: ${u(2.5)}; padding-bottom: ${u(2)}; }
    .ds-terms-body { line-height: ${u(12)}; padding-top: ${u(1)}; }
    .ds-terms-head > div, .ds-terms-body > div { min-width: 0; padding-right: ${u(6)}; overflow-wrap: anywhere; }
    .ds-terms-head > div:last-child, .ds-terms-body > div:last-child { text-align: center; padding-right: 0; }

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
    .ds-ship { display: grid; grid-template-columns: auto minmax(0, ${u(220)}); margin-left: ${u(4)}; font-size: ${u(9)}; line-height: ${u(14)}; }
    .ds-ship-l { background: ${band}; color: ${bandText}; font-weight: 500; padding: 0 ${u(6)} 0 ${u(4)}; white-space: nowrap; }
    .ds-ship-v { padding-left: ${u(4)}; overflow-wrap: anywhere; }
    .ds-ship-v p, .ds-ship-v ul, .ds-ship-v ol { margin: 0; }
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
    .ds-sign { align-self: flex-end; width: ${u(120)}; margin: ${u(48)} ${u(24)} 0 0; text-align: center; font-size: ${u(9)}; line-height: ${u(14)}; break-inside: avoid; }
    .ds-sign-line { border-top: 0.5pt solid #000; margin-bottom: ${u(3)}; }
    .ds-thanks { text-align: center; font-size: ${u(10)}; line-height: ${u(14)}; margin-top: ${u(16)}; }
    .ds-foot { display: flex; justify-content: space-between; align-items: flex-start; margin: ${u(15)} ${u(20)} 0; padding: ${u(5)} 0 ${u(12)};
      border-top: 0.5pt solid #d4d4d4; font-size: ${u(9)}; line-height: ${u(12.6)}; }
    .ds-cont { display: flex; justify-content: space-between; align-items: flex-start; gap: ${u(16)}; padding: 0 ${u(20)}; margin-bottom: ${u(14)};
      font-weight: 600; line-height: ${u(13.2)}; }
    .ds-cont-l { min-width: 0; overflow-wrap: anywhere; }
    .ds-cont-r { flex: none; max-width: ${u(CONT_COL_U)}; line-height: ${u(12)}; text-align: left; }
    .ds-cont-no { display: flex; align-items: center; gap: ${u(3)}; font-size: ${u(14)}; line-height: ${u(20)}; white-space: nowrap; overflow: hidden; }
    .ds-cont-no .ds-barcode-svg { flex: none; }

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

/** Runs `fn` with the Print button's one-off header style applied, when one was picked. */
function withPickedHeaderStyle<T>(fn: () => T): T {
  const picked = pickedPrintHeaderStyle()
  return picked ? withDistributorSettings({ ...getActiveDistributorSettings(), headerStyle: picked }, fn) : fn()
}

/** Full print document for one invoice on A4 / A5 / A5 landscape / half of a landscape A4. */
export function generateDistributorInvoiceHTML(data: PrintInvoiceData, sheetSize: SheetSize, ctx: DistributorPrintContext): string {
  return withPickedHeaderStyle(() => distributorInvoiceHTML(data, sheetSize, ctx))
}

function distributorInvoiceHTML(data: PrintInvoiceData, sheetSize: SheetSize, ctx: DistributorPrintContext): string {
  const layout: Layout = sheetSize === 'a4-half-left' ? 'half-left' : sheetSize === 'a4-half-right' ? 'half-right' : 'single'
  const sheet: SheetKey = layout !== 'single' ? 'a5' : (sheetSize as SheetKey)
  const pages = buildDistributorPages(data, ctx, sheet)
  const title = documentTitle(ctx.isQuotation, isReturn(data))
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
  return withPickedHeaderStyle(() => distributorTwoUpHTML(left, right))
}

function distributorTwoUpHTML(
  left: { data: PrintInvoiceData; ctx: DistributorPrintContext },
  right: { data: PrintInvoiceData; ctx: DistributorPrintContext },
): string {
  const l = buildDistributorPages(left.data, left.ctx, 'a5')
  const r = buildDistributorPages(right.data, right.ctx, 'a5')
  const rows = Array.from({ length: Math.max(l.length, r.length) }, (_, i) =>
    `<div class="ds-row"><div class="ds-slot">${l[i] ?? ''}</div><div class="ds-slot">${r[i] ?? ''}</div></div>`,
  ).join('')
  return documentShell('a5', 'half-left', documentTitle(left.ctx.isQuotation, isReturn(left.data)), rows, left.ctx)
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
