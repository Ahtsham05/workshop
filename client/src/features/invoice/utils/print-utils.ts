import { invoiceNoteToSafeHtml, escapeHtml } from '@/lib/escape-html'
import { invoiceTermsToSafeHtml } from '@/lib/rich-text-utils'
import { isElectronApp } from '@/lib/sync/electron'
import { a4Labels, receiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from './language'
import {
  buildPrintActionsLabels,
  buildPrintWindowActionsBlock,
  printActionsBarStyles,
} from './invoice-print-whatsapp'
import {
  ensureInvoicePrintContactBridge,
  stashPrintContact,
  type PrintWindowContact,
} from './invoice-print-contact-bridge'
import { ensureInvoiceWhatsAppSendBridge } from './invoice-print-whatsapp-bridge'
import { ensureInvoicePrintPdfBridge } from './invoice-print-pdf-bridge'
import { ensureInvoiceSmsSendBridge } from './invoice-print-sms-bridge'
import { PAPER_FORMATS, type PaperSize, type SheetSize, type PaperFormatKey } from './paper-format'
import { INVOICE_TEMPLATE_ITEMS_PER_PAGE, INVOICE_TEMPLATE_CSS, type InvoiceTemplate } from './invoice-template'

export type { PrintWindowContact }
export type { PaperSize }
export type { InvoiceTemplate }

export interface PrintInvoiceData {
  invoiceNumber: string
  items: Array<{
    name: string
    nameUrdu?: string | null
    quantity: number
    unit?: string
    unitPrice: number
    subtotal: number
    imeis?: string[]
  }>
  customerId?: string | { name: string; id: string; _id?: string }
  customerName?: string
  /** Urdu name for registered customers (walk-in uses walk-in name only). */
  customerNameUrdu?: string
  walkInCustomerName?: string
  type: 'cash' | 'credit' | 'pending' | 'quotation'
  subtotal: number
  tax: number
  discount: number
  total: number
  paidAmount: number
  balance: number
  dueDate?: string
  notes?: string
  /** Branch-level footer from Branch Management (shown on all prints when set) */
  invoiceNote?: string
  deliveryCharge?: number
  serviceCharge?: number
  previousBalance?: number
  newBalance?: number
  netBalance?: number
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxNumber?: string
  /** When printing in Urdu (`printInUrdu` / resolved language), shown as header title before English fallback. */
  companyNameUrdu?: string
  /** Branch street address for the labeled address row on receipts (from Branch Management). */
  invoiceAddress?: string
  invoiceAddressUrdu?: string
  companyLogo?: string
  isTrial?: boolean
  language?: InvoiceLanguage
  isUrduOnly?: boolean
  userPreferredLanguage?: InvoiceLanguage
  /**
   * Forces print language for labels + name script:
   * `true` — Urdu headings and Urdu names (fallback to English if missing).
   * `false` — English headings and English names only.
   * Omit — follow invoice / user preference (`resolveInvoiceLanguage`).
   */
  printInUrdu?: boolean
  /** Max line items per sheet before a continuation page (A4). Default 14. */
  a4ItemsPerPage?: number
  /** Customer mobile for WhatsApp send from print preview. */
  customerPhone?: string
  customerWhatsapp?: string
  /** Invoice date (YYYY-MM-DD) for PDF filename; defaults to today when omitted. */
  invoiceDate?: string
  /** When true, print title uses Quotation and number prefix INV- becomes QUO-. */
  printAsQuotation?: boolean
}

/** INV-202605-000195 → QUO-202605-000195 when printing as quotation. */
export function resolvePrintDocumentNumber(invoiceNumber: string, printAsQuotation?: boolean): string {
  const num = String(invoiceNumber || '').trim()
  if (!printAsQuotation || !num) return num
  if (/^QUO-/i.test(num)) return num
  if (/^INV-/i.test(num)) return num.replace(/^INV-/i, 'QUO-')
  return `QUO-${num}`
}

const isQuotationPrint = (data: PrintInvoiceData) =>
  Boolean(data.printAsQuotation || data.type === 'quotation')

const isQuoteStyleTotals = (type: PrintInvoiceData['type']) =>
  type === 'pending' || type === 'quotation'

function resolvePrintDocumentTitle(
  data: PrintInvoiceData,
  labels: { invoice_title: string; quotation_title?: string },
): string {
  if (isQuotationPrint(data)) {
    return labels.quotation_title || 'Quotation'
  }
  return labels.invoice_title
}

function resolvePrintDocumentDate(data: PrintInvoiceData): Date {
  const raw = data.invoiceDate?.trim()
  if (raw) {
    const parsed = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

function resolvePrintLanguage(data: PrintInvoiceData): InvoiceLanguage {
  if (data.printInUrdu === true) return 'ur'
  if (data.printInUrdu === false) return 'en'
  return resolveInvoiceLanguage(data)
}

/** Receipt/A4 header line: Urdu branch/org name when printing in Urdu, else English. */
function resolveHeaderBusinessName(data: PrintInvoiceData, lang: InvoiceLanguage): string {
  const en = (data.companyName ?? '').trim()
  const ur = (data.companyNameUrdu ?? '').trim()
  if (lang === 'ur') return ur || en
  return en || ur
}

/** Branch street address under company name — English or Urdu per print language. */
function formatPrintHeaderAddress(data: PrintInvoiceData, lang: InvoiceLanguage): string {
  const en = (data.invoiceAddress ?? '').trim()
  const ur = (data.invoiceAddressUrdu ?? '').trim()
  if (!en && !ur) return ''
  const text = lang === 'ur' ? ur || en : en || ur
  return escapeHtml(text)
}

/** Professional contact line: "Contact: 0300…" */
function formatPrintContactLine(phone: string | undefined, contactLabel: string): string {
  const num = (phone ?? '').trim()
  if (!num) return ''
  return `<span class="contact-label">${escapeHtml(contactLabel)}:</span> ${escapeHtml(num)}`
}

export const generateBarcodeText = (text: string): string => {
  // Generate Code 39 barcode format - requires * start/stop characters
  return `*${text}*`
}

export const formatCurrency = (amount: number): string => {
  return `Rs${amount.toFixed(2)}`
}

/** Single-line product title: Urdu script when `lang === 'ur'` (fallback EN). Appends IMEI(s) sold, if any. */
function formatPrintItemCell(
  item: { name: string; nameUrdu?: string | null; imeis?: string[] },
  lang: InvoiceLanguage,
): string {
  const text = lang === 'ur' ? item.nameUrdu?.trim() || item.name : item.name
  let html = escapeHtml(text)
  if (item.imeis && item.imeis.length > 0) {
    html += `<br><span style="font-size:10px;color:#666;">IMEI: ${item.imeis.map((n) => escapeHtml(n)).join(', ')}</span>`
  }
  return html
}

/** Single-line customer display for print. Walk-in: stored name as entered. */
function formatPrintCustomerCell(
  customerId: unknown,
  walkInCustomerName: string | undefined,
  customerName: string | undefined,
  customerNameUrdu: string | undefined,
  walkInFallback: string,
  naFallback: string,
  lang: InvoiceLanguage,
): string {
  if (customerId === 'walk-in') {
    return escapeHtml(walkInCustomerName?.trim() || walkInFallback)
  }
  const en = customerName?.trim() || naFallback
  const ur = customerNameUrdu?.trim()
  return escapeHtml(lang === 'ur' ? ur || en : en)
}

export const generateInvoiceHTML = (
  data: PrintInvoiceData,
  thermalSize: 'thermal80' | 'thermal58' = 'thermal80',
): string => {
  const format = PAPER_FORMATS[thermalSize]
  const {
    invoiceNumber,
    items,
    customerId,
    customerName,
    customerNameUrdu,
    walkInCustomerName,
    type,
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    // balance,
    notes,
    invoiceNote,
    deliveryCharge = 0,
    serviceCharge = 0,
    companyPhone,
  } = data

  const quotationPrint = isQuotationPrint(data)
  const language = resolvePrintLanguage(data)
  const labels = receiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'

  // Resolve balances - prefer explicit fields from `data` when provided
  const previousBalance = (data.previousBalance !== undefined && data.previousBalance !== null)
    ? data.previousBalance
    : 0
  const hasPrevious = (data.previousBalance !== undefined && data.previousBalance !== null)
  const currentInvoice = total || 0
  const paid = paidAmount || 0
  const totalWithPrev = previousBalance + currentInvoice
  const balanceDue = Math.abs(totalWithPrev - paid)
  // const netBalance = (data.netBalance !== undefined && data.netBalance !== null)
  //   ? data.netBalance
  //   : totalWithPrev - paid

  const headerBusinessName = resolveHeaderBusinessName(data, language)
  const headerAddressLine = formatPrintHeaderAddress(data, language)

  const contactLine = formatPrintContactLine(companyPhone, labels.contact_label)

  const urduTexts = {
    ...labels,
    business_name: headerBusinessName || labels.business_name,
  }

  const termsHtml = notes ? invoiceTermsToSafeHtml(String(notes)) : ''
  const printNumber = resolvePrintDocumentNumber(invoiceNumber, isQuotationPrint(data))
  const documentTitle = resolvePrintDocumentTitle(data, labels)
  const documentDate = resolvePrintDocumentDate(data)
  const formattedDocumentDate = documentDate.toLocaleDateString(locale)

  const getTypeText = (type: string) => {
    switch(type) {
      case 'cash': return urduTexts.cash
      case 'credit': return urduTexts.credit
      case 'pending': return urduTexts.pending
      case 'quotation': return urduTexts.quotation_title || 'Quotation'
      default: return type
    }
  }

  const customerNameHtml = formatPrintCustomerCell(
    customerId,
    walkInCustomerName,
    customerName,
    customerNameUrdu,
    urduTexts.walk_in_customer,
    urduTexts.not_available,
    language,
  )

  const printActions = buildPrintWindowActionsBlock(
    data,
    buildPrintActionsLabels(language, 'receipt', urduTexts.print_receipt, urduTexts.print_receipt),
  )

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle} ${printNumber}</title>
  <style>
    ${printActionsBarStyles}
    @media print {
      @page {
        margin: ${format.pageMargin};
        size: ${format.pageCss};
      }
      body {
        margin: 0;
        padding: 0;
        font-size: ${format.baseFontPx}px;
      }
      .no-print {
        display: none !important;
      }
    }

    body {
      font-family: 'Inter', 'Manrope', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: ${format.baseFontPx}px;
      line-height: 1.4;
      margin: 0;
      padding: 8px;
      width: ${format.bodyWidthPx}px;
      background: white;
      color: #000;
      direction: ${dir};
      text-align: ${startAlign};
    }
    
    .receipt-header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }
    
    .company-logo {
      max-width: 120px;
      height: auto;
      margin: 0 auto 8px;
      display: block;
    }
    
    .business-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
      text-transform: ${language === 'ur' ? 'none' : 'uppercase'};
    }
    
    .business-info {
      font-size: 13px;
      margin-bottom: 1px;
      color: #000;
    }
    
    .invoice-info {
      margin-bottom: 12px;
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      font-size: 12px;
    }
    
    .info-label {
      font-weight: bold;
    }

    .customer-name-highlight {
      font-size: 14px;
      font-weight: 800;
      color: #000;
      text-align: ${startAlign};
    }

    .customer-row {
      align-items: baseline;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed #ccc;
    }

    .company-contact-line {
      font-size: 13px;
      margin-top: 2px;
    }

    .company-contact-line .contact-label {
      font-weight: 700;
      color: #000;
    }

    .company-contact-line {
      color: #000;
    }
    
    .items-section {
      margin-bottom: 12px;
    }
    
    .items-header {
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
      margin-bottom: 5px;
      font-weight: bold;
      font-size: 12px;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 4px;
      table-layout: fixed;
    }
    
    .items-table th {
      border-bottom: 1px dashed #000;
      padding: 3px 2px;
      text-align: ${startAlign};
      font-weight: bold;
      font-size: 11px;
      white-space: nowrap;
    }
    
    .items-table th:first-child {
      width: 18px;
      text-align: center;
    }
    
    .items-table th:nth-child(3) {
      width: 50px;
      text-align: center;
    }
    
    .items-table th:nth-child(4) {
      width: 32px;
      text-align: center;
    }
    
    .items-table th:last-child {
      width: 58px;
      text-align: ${language === 'ur' ? 'left' : 'right'};
    }
    
    .items-table td {
      padding: 3px 2px;
      vertical-align: top;
      border-bottom: 1px dotted #ddd;
      font-size: 11px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    
    .items-table td:first-child {
      text-align: center;
    }
    
    .items-table td:nth-child(3),
    .items-table td:nth-child(4) {
      text-align: center;
      white-space: nowrap;
    }
    
    .items-table td:last-child {
      text-align: ${language === 'ur' ? 'left' : 'right'};
      font-weight: bold;
      white-space: nowrap;
    }
    
    .items-table .total-row-table td {
      border-top: 1px dashed #000;
      border-bottom: none;
      font-weight: bold;
      padding-top: 4px;
    }
    
    .totals-section {
      border-top: 2px solid #000;
      padding-top: 8px;
      margin-bottom: 12px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      font-size: 13px;
    }
    
    .total-final {
      font-weight: bold;
      font-size: 16px;
      border-top: 1px solid #000;
      padding-top: 3px;
      margin-top: 3px;
    }
    
    .payment-section {
      margin-bottom: 12px;
      border-top: 1px dashed #000;
      padding-top: 8px;
    }
    
    .barcode-section {
      text-align: center;
      margin: 12px 0;
      padding: 8px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }
    
    .barcode {
      font-family: 'Libre Barcode 39', 'Courier New', monospace;
      font-size: 20px;
      letter-spacing: 1px;
      margin: 6px 0;
      font-weight: normal;
      direction: ltr;
    }
    
    .barcode-text {
      font-size: 8px;
      margin-top: 2px;
    }
    
    .notes-section {
      margin: 12px 0;
      padding: 8px 0;
      border-top: 1px dashed #000;
      font-size: 9px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .notes-section .notes-content {
      line-height: 1.45;
      white-space: normal;
      word-break: break-word;
    }

    .notes-section .notes-content b,
    .notes-section .notes-content strong {
      font-weight: bold;
    }

    .notes-section .notes-content i,
    .notes-section .notes-content em {
      font-style: italic;
    }

    .notes-section .notes-content u {
      text-decoration: underline;
    }

    .notes-section .notes-content ul,
    .notes-section .notes-content ol {
      margin: 4px 0;
      padding-left: 16px;
    }

    .invoice-branch-note {
      margin: 10px 0 0;
      padding: 8px 4px 0;
      border-top: 1px dashed #666;
      font-size: 10px;
      text-align: center;
      line-height: 1.35;
      white-space: normal;
      word-break: break-word;
    }
    
    .footer {
      text-align: center;
      font-size: 9px;
      margin-top: 12px;
      border-top: 2px solid #000;
      padding-top: 8px;
    }
    
    .footer-line {
      margin-bottom: 2px;
    }
    
    .no-print {
      text-align: center;
      margin: 20px 0;
      padding: 15px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .print-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      width: 100%;
    }
    
    .print-btn {
      padding: 8px 16px;
      margin: 0 5px;
      font-size: 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }
    
    .print-btn-primary {
      background: #007bff;
      color: white;
    }
    
    .print-btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .highlight {
      background: #ffffcc;
      padding: 1px 2px;
    }
    
    @media screen {
      body {
        max-width: ${(format.bodyWidthPx ?? 300) + 50}px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        padding: 20px;
        border-radius: 8px;
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="invoice-print-root">
  <div class="receipt-header">
    ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${urduTexts.business_name}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus solutions" class="company-logo" />` : ''}
    <div class="business-name">${urduTexts.business_name}</div>
    ${headerAddressLine ? `<div class="business-info">${headerAddressLine}</div>` : ''}
    ${contactLine ? `<div class="business-info company-contact-line">${contactLine}</div>` : ''}
  </div>
  
  <div class="invoice-info">
    <div class="info-row">
      <span class="info-label">${quotationPrint ? (urduTexts.quotation_number || 'Quotation No') : urduTexts.invoice_number}:</span>
      <span class="highlight">${printNumber}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${urduTexts.date}:</span>
      <span>${formattedDocumentDate} ${new Date().toLocaleTimeString(locale)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${urduTexts.type}:</span>
      <span>${getTypeText(type)}</span>
    </div>
    <div class="info-row customer-row">
      <span class="info-label">${urduTexts.customer}:</span>
      <span class="customer-name-highlight">${customerNameHtml}</span>
    </div>
  </div>
  
  <div class="items-section">
    <div class="items-header">${urduTexts.items_purchased}</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>S.r.</th>
          <th>${urduTexts.product}</th>
          <th>${urduTexts.price}</th>
          <th>${urduTexts.qty}</th>
          <th>${urduTexts.amount}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${formatPrintItemCell(item, language)}</td>
          <td>${item.unitPrice.toFixed(2)}</td>
          <td>${item.quantity}</td>
          <td>${item.subtotal.toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr class="total-row-table">
          <td colspan="2">${urduTexts.total}:</td>
          <td></td>
          <td>${items.reduce((sum, item) => sum + item.quantity, 0)}</td>
          <td>${subtotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  
  ${(() => {
    const hasExtraCharges = discount > 0 || deliveryCharge > 0 || serviceCharge > 0 || tax > 0
    if (isQuoteStyleTotals(type)) {
      if (hasExtraCharges) {
        return `
  <div class="totals-section">
    <div class="total-row">
      <span>${urduTexts.subtotal}:</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>
    ${discount > 0 ? `<div class="total-row"><span>${urduTexts.discount}:</span><span>-${formatCurrency(discount)}</span></div>` : ''}
    ${deliveryCharge > 0 ? `<div class="total-row"><span>${urduTexts.delivery_charge}:</span><span>${formatCurrency(deliveryCharge)}</span></div>` : ''}
    ${serviceCharge > 0 ? `<div class="total-row"><span>${urduTexts.service_charge}:</span><span>${formatCurrency(serviceCharge)}</span></div>` : ''}
    ${tax > 0 ? `<div class="total-row"><span>${urduTexts.tax}:</span><span>${formatCurrency(tax)}</span></div>` : ''}
    <div class="total-row total-final">
      <span>${urduTexts.total}:</span>
      <span>${formatCurrency(total)}</span>
    </div>
  </div>`
      }
      return `
  <div class="totals-section">
    <div class="total-row total-final">
      <span>${urduTexts.total}:</span>
      <span>${formatCurrency(total)}</span>
    </div>
  </div>`
    }
    if (hasExtraCharges) {
      return `
  <div class="totals-section">
    ${discount > 0 ? `<div class="total-row"><span>${urduTexts.discount}:</span><span>-${formatCurrency(discount)}</span></div>` : ''}
    ${deliveryCharge > 0 ? `<div class="total-row"><span>${urduTexts.delivery_charge}:</span><span>${formatCurrency(deliveryCharge)}</span></div>` : ''}
    ${serviceCharge > 0 ? `<div class="total-row"><span>${urduTexts.service_charge}:</span><span>${formatCurrency(serviceCharge)}</span></div>` : ''}
    ${tax > 0 ? `<div class="total-row"><span>${urduTexts.tax}:</span><span>${formatCurrency(tax)}</span></div>` : ''}
  </div>`
    }
    return ''
  })()}
  
  ${!isQuoteStyleTotals(type) ? `
    <div class="payment-section">
      ${(hasPrevious && customerId !== 'walk-in') ? `
      <div class="total-row" style="font-size: 12px; margin-bottom: 3px;">
        <span>${urduTexts.previous_balance}:</span>
        <span style="font-weight: bold;">${formatCurrency(Math.abs(previousBalance))}</span>
      </div>
      <div class="total-row" style="font-size: 12px; margin-bottom: 3px;">
        <span>${urduTexts.current_invoice}:</span>
        <span style="font-weight: bold;">${formatCurrency(currentInvoice)}</span>
      </div>
      <div class="total-row" style="font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; color: #000;">
        <span>${urduTexts.net_balance}:</span>
        <span>${formatCurrency(balanceDue)}</span>
      </div>
      ` : `
      <div class="total-row" style="font-size: 13px; font-weight: bold; margin-bottom: 3px;">
        <span>${urduTexts.current_invoice}:</span>
        <span>${formatCurrency(currentInvoice)}</span>
      </div>
      <div class="total-row" style="font-size: 12px; margin-bottom: 3px;">
        <span>${urduTexts.paid}:</span>
        <span>${formatCurrency(paid)}</span>
      </div>
      <div class="total-row" style="font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; color: #000;">
        <span>${urduTexts.balance_due}:</span>
        <span>${formatCurrency(balanceDue)}</span>
      </div>
      `}
    </div>
  ` : ''}
  
  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${quotationPrint ? (urduTexts.quotation_number || 'Quotation No') : urduTexts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(printNumber)}</div>
    <div class="barcode-text">${printNumber}</div>
  </div>
  
  ${termsHtml ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 3px;">${urduTexts.terms_and_conditions}:</div>
      <div class="notes-content">${termsHtml}</div>
    </div>
  ` : ''}

  ${invoiceNote?.trim() ? `
    <div class="invoice-branch-note">${invoiceNoteToSafeHtml(invoiceNote)}</div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line"><strong>${urduTexts.thank_you}</strong></div>
    <div class="footer-line">${urduTexts.keep_receipt}</div>
    <div class="footer-line">${urduTexts.visit_again}</div>
    <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold; text-align: center; line-height: 1.2;">
      ${urduTexts.powered_by}
    </div>
  </div>
  </div>
  ${printActions}
</body>
</html>
  `.trim()
}

// Generate A4/A5 Invoice HTML with table layout
export const generateA4InvoiceHTML = (
  data: PrintInvoiceData,
  sheetSize: SheetSize = 'a4',
  template: InvoiceTemplate = 'standard',
): string => {
  if (sheetSize === 'a4-half-left' || sheetSize === 'a4-half-right') {
    return generateA4HalfLandscapeInvoiceHTML(data, sheetSize === 'a4-half-left' ? 'left' : 'right', template)
  }
  const format = PAPER_FORMATS[sheetSize]
  const {
    invoiceNumber,
    items,
    customerId,
    customerName,
    customerNameUrdu,
    walkInCustomerName,
    type,
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    // balance,
    notes,
    deliveryCharge = 0,
    serviceCharge = 0,
    companyPhone,
  } = data

  const quotationPrint = isQuotationPrint(data)
  const language = resolvePrintLanguage(data)
  const labels = a4Labels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'
  const endAlign = language === 'ur' ? 'left' : 'right'

  const headerBusinessName = resolveHeaderBusinessName(data, language)
  const headerAddressLine = formatPrintHeaderAddress(data, language)

  const contactLine = formatPrintContactLine(companyPhone, labels.contact_label)

  const urduTexts = {
    ...labels,
    business_name: headerBusinessName || labels.business_name,
  }

  const getTypeText = (typeValue: string) => {
    switch (typeValue) {
      case 'cash': return urduTexts.cash
      case 'credit': return urduTexts.credit
      case 'pending': return urduTexts.pending
      case 'quotation': return urduTexts.quotation_title || 'Quotation'
      default: return typeValue
    }
  }

  const customerNameHtml = formatPrintCustomerCell(
    customerId,
    walkInCustomerName,
    customerName,
    customerNameUrdu,
    urduTexts.walk_in_customer,
    urduTexts.not_available,
    language,
  )

  const printNumber = resolvePrintDocumentNumber(invoiceNumber, isQuotationPrint(data))
  const documentTitle = resolvePrintDocumentTitle(data, labels)

  const printActions = buildPrintWindowActionsBlock(
    data,
    buildPrintActionsLabels(language, 'a4', urduTexts.print_invoice, urduTexts.print_invoice),
  )

  // Resolve balances for A4 - prefer explicit fields from `data` when provided
  const previousBalance = (data.previousBalance !== undefined && data.previousBalance !== null)
    ? data.previousBalance
    : 0
  const hasPrevious = (data.previousBalance !== undefined && data.previousBalance !== null)
  const currentInvoice = total || 0
  const paid = paidAmount || 0
  const totalWithPrev = previousBalance + currentInvoice
  // const balanceDue = Math.abs(totalWithPrev - paid)
  const pageIndicator = (page: number, total: number) =>
    urduTexts.page_indicator.replace('{page}', String(page)).replace('{total}', String(total))

  const itemsPerPage =
    typeof data.a4ItemsPerPage === 'number' && data.a4ItemsPerPage > 0
      ? Math.min(120, Math.floor(data.a4ItemsPerPage))
      : (INVOICE_TEMPLATE_ITEMS_PER_PAGE[template]?.[sheetSize] ?? format.itemsPerPage ?? 14)

  const chunks: typeof items[] = []
  for (let i = 0; i < items.length; i += itemsPerPage) {
    chunks.push(items.slice(i, i + itemsPerPage))
  }
  if (chunks.length === 0) chunks.push([])

  const detailsSectionTitle = quotationPrint
    ? (urduTexts.quotation_details || 'Quotation Details')
    : urduTexts.invoice_details

  const documentDate = resolvePrintDocumentDate(data)
  const formattedDocumentDate = documentDate.toLocaleDateString(locale)

  const headerBlock = `
<div class="invoice-header">
    <div class="company-info">
      ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${urduTexts.business_name}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus solutions" class="company-logo" />` : ''}
      <div class="company-name">${urduTexts.business_name}</div>
      ${headerAddressLine || contactLine ? `
      <div class="company-details">
        ${headerAddressLine ? `${headerAddressLine}<br>` : ''}
        ${contactLine ? `<span class="company-contact-line">${contactLine}</span>` : ''}
      </div>
      ` : ''}
    </div>
    <div class="invoice-details">
      <div class="invoice-title">${documentTitle}</div>
      <div class="invoice-meta">
        <div><strong>#${printNumber}</strong></div>
        <div>${urduTexts.date}: ${formattedDocumentDate}</div>
        <div>${urduTexts.time}: ${new Date().toLocaleTimeString(locale)}</div>
      </div>
    </div>
  </div>
  
  <div class="invoice-info">
    <div class="info-section bill-to-section">
      <div class="info-title">${urduTexts.bill_to}</div>
      <div class="customer-bill-line">
        <span class="customer-field-label">${urduTexts.customer}</span>
        <span class="bill-to-customer-name">${customerNameHtml}</span>
        <span class="bill-to-invoice-type status-badge status-${type}">${getTypeText(type)}</span>
      </div>
    </div>
    <div class="info-section invoice-details-section">
      <div class="info-title">${detailsSectionTitle}</div>
      <div class="info-row detail-row">
        <span class="info-label">${urduTexts.issue_date}</span>
        <span class="detail-value">${formattedDocumentDate}</span>
      </div>
    </div>
  </div>
`

  const hasExtraCharges = discount > 0 || deliveryCharge > 0 || serviceCharge > 0 || tax > 0
  const showItemizedTotalsTable = isQuoteStyleTotals(type) || hasExtraCharges

  const itemizedTotalsTable = showItemizedTotalsTable
    ? `
<div class="totals-wrapper">
    <table class="totals-table">
      ${isQuoteStyleTotals(type) && subtotal > 0 ? `
      <tr>
        <td class="total-label">${urduTexts.subtotal}:</td>
        <td class="total-amount">${formatCurrency(subtotal)}</td>
      </tr>
      ` : ''}
      ${discount > 0 ? `
      <tr>
        <td class="total-label">${urduTexts.discount}:</td>
        <td class="total-amount">-${formatCurrency(discount)}</td>
      </tr>
      ` : ''}
      ${deliveryCharge > 0 ? `
      <tr>
        <td class="total-label">${urduTexts.delivery_charge}:</td>
        <td class="total-amount">${formatCurrency(deliveryCharge)}</td>
      </tr>
      ` : ''}
      ${serviceCharge > 0 ? `
      <tr>
        <td class="total-label">${urduTexts.service_charge}:</td>
        <td class="total-amount">${formatCurrency(serviceCharge)}</td>
      </tr>
      ` : ''}
      ${tax > 0 ? `
      <tr>
        <td class="total-label">${urduTexts.tax}:</td>
        <td class="total-amount">${formatCurrency(tax)}</td>
      </tr>
      ` : ''}
      ${isQuoteStyleTotals(type) ? `
      <tr class="final-total">
        <td class="total-label">${urduTexts.total}:</td>
        <td class="total-amount" style="font-size: 18px; font-weight: bold;">${formatCurrency(total)}</td>
      </tr>
      ` : ''}
    </table>
  </div>
`
    : ''

  const termsHtml = notes ? invoiceTermsToSafeHtml(String(notes)) : ''

  const totalsBlock = `
${itemizedTotalsTable}

  ${!isQuoteStyleTotals(type) ? `
  <div class="totals-wrapper">
    <table class="totals-table">
      <tr>
        <td class="total-label" style="font-weight: bold;">${urduTexts.current_invoice}:</td>
        <td class="total-amount" style="font-size: 18px; font-weight: bold;">${formatCurrency(total)}</td>
      </tr>
      ${(hasPrevious && customerId !== 'walk-in') ? `
      <tr>
        <td class="total-label" style="background: #f5f5f5;">${urduTexts.previous_balance}:</td>
        <td class="total-amount" style="background: #f5f5f5; color: #000; font-size: 16px;">
          ${formatCurrency(Math.abs(previousBalance))} ${previousBalance > 0 ? '(Dr)' : previousBalance < 0 ? '(Cr)' : ''}
        </td>
      </tr>
      ` : ''}
      <tr style="border-top: 2px solid #000;">
        <td class="total-label" style="font-weight: bold; color: #000;">${urduTexts.balance_due}:</td>
        <td class="total-amount" style="font-size: 18px; font-weight: bold; color: #000;">${formatCurrency(Math.abs(totalWithPrev - paid))}</td>
      </tr>
    </table>
  </div>
  ` : ''}

  
  ${termsHtml ? `
    <div class="notes-section">
      <div class="terms-heading">${urduTexts.terms_and_conditions}:</div>
      <div class="notes-content">${termsHtml}</div>
    </div>
  ` : ''}

  <div class="footer">
    <div class="footer-line footer-thank-you">${urduTexts.thank_you}</div>
    <div class="footer-line">${urduTexts.keep_receipt}</div>
  </div>
`

  let runningItemsSum = 0
  const totalPages = chunks.length

  const pagesHtml = chunks
    .map((chunk, pi) => {
      const isLastPage = pi === chunks.length - 1
      const pageLineSum = chunk.reduce((acc, row) => acc + (Number(row.subtotal) || 0), 0)
      const prevPagesLineSum = runningItemsSum
      runningItemsSum += pageLineSum

      const continuationBanner =
        pi > 0
          ? `<div class="continuation-banner"><strong>#${printNumber}</strong> — ${urduTexts.continuation} (${pageIndicator(pi + 1, totalPages)})</div>`
          : ''

      const rowStart = pi * itemsPerPage
      const tableRows =
        chunk.length === 0
          ? `<tr><td colspan="5" class="text-center">${urduTexts.not_available}</td></tr>`
          : chunk
              .map((item, idx) => {
                const index = rowStart + idx
                return `
        <tr>
          <td class="text-center"><strong>${index + 1}</strong></td>
          <td class="text-left"><strong>${formatPrintItemCell(item, language)}</strong></td>
          <td class="text-center"><strong>${item.quantity} ${item.unit || 'pcs'}</strong></td>
          <td class="text-right"><strong>${formatCurrency(item.unitPrice)}</strong></td>
          <td class="text-right"><strong>${formatCurrency(item.subtotal)}</strong></td>
        </tr>`
              })
              .join('')

      const multiPageSummary =
        totalPages > 1
          ? `<div class="page-items-summary">
            ${pi > 0 ? `<span>${urduTexts.previous_pages_items_total}: ${formatCurrency(prevPagesLineSum)}</span>` : ''}
            <span>${urduTexts.this_page_items_total}: ${formatCurrency(pageLineSum)}</span>
            <span>${urduTexts.running_items_total}: ${formatCurrency(runningItemsSum)}</span>
            <span>${pageIndicator(pi + 1, totalPages)}</span>
          </div>`
          : ''

      const tableBlock = `
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 40%;">${urduTexts.product_name}</th>
        <th style="width: 12%;" class="text-center">${urduTexts.quantity}</th>
        <th style="width: 15%;" class="text-right">${urduTexts.unit_price}</th>
        <th style="width: 18%;" class="text-right">${urduTexts.total}</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`

      const pageClass = !isLastPage ? 'invoice-print-page invoice-print-page-break' : 'invoice-print-page'

      const tail = isLastPage ? totalsBlock : ''

      return `<div class="${pageClass}">${continuationBanner}${headerBlock}${tableBlock}${multiPageSummary}${tail}</div>`
    })
    .join('')


  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle} ${printNumber}</title>
  <style>
    ${printActionsBarStyles}
    @media print {
      @page {
        margin: ${format.pageMargin};
        size: ${format.pageCss};
      }
      body {
        margin: 0;
        padding: 0;
        font-size: ${format.baseFontPx}px;
      }
      .no-print {
        display: none !important;
      }
    }

    body {
      font-family: 'Inter', 'Manrope', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: ${format.baseFontPx}px;
      line-height: 1.4;
      margin: 0;
      padding: 20px;
      background: white;
      color: #000;
      direction: ${dir};
      text-align: ${startAlign};
    }

    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      border-bottom: 3px solid black;
      padding-bottom: 20px;
    }
    
    .company-info {
      flex: 1;
    }
    
    .company-logo {
      max-width: 150px;
      height: auto;
      margin-bottom: 10px;
      display: block;
    }
    
    .company-name {
      font-size: 48px;
      font-weight: 900;
      color: #007bff;
      margin-bottom: 8px;
    }
    
    .company-details {
      font-size: 19px;
      color: #000;
      line-height: 1.4;
    }

    .invoice-details {
      text-align: ${endAlign};
      flex: 1;
    }

    .invoice-title {
      font-size: 28px;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
    }

    .invoice-meta {
      font-size: 16px;
      color: #666;
    }
    
    .invoice-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px 32px;
      margin-bottom: 30px;
      padding: 20px 24px;
      background: #f8f9fa;
      border-radius: 8px;
      align-items: start;
    }
    
    .info-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    html[dir="rtl"] .bill-to-section,
    html[dir="rtl"] .invoice-details-section {
      text-align: start;
      align-items: flex-start;
    }
    html[dir="ltr"] .bill-to-section,
    html[dir="ltr"] .invoice-details-section {
      text-align: start;
      align-items: flex-start;
    }
    
    .info-title {
      font-weight: bold;
      font-size: 18px;
      color: #333;
      margin: 0 0 4px;
      padding-bottom: 6px;
      border-bottom: 2px solid #dee2e6;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      font-size: 15px;
      width: 100%;
    }

    .customer-bill-line {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      justify-content: flex-start;
      flex-wrap: nowrap;
      gap: 4px;
      width: 100%;
      max-width: 100%;
      margin-top: 0;
      text-align: start;
    }

    .customer-field-label {
      font-size: 15px;
      font-weight: 600;
      color: #555;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .customer-field-label::after {
      content: ':';
      margin-inline-start: 2px;
    }

    .info-row.detail-row {
      flex-wrap: wrap;
    }

    html[dir="rtl"] .info-row.detail-row {
      flex-direction: row;
      justify-content: flex-start;
      align-items: baseline;
    }

    html[dir="ltr"] .info-row.detail-row {
      justify-content: flex-start;
      align-items: baseline;
    }
    
    .info-label {
      font-weight: 600;
      color: #555;
      flex-shrink: 0;
    }

    .detail-value {
      font-weight: 500;
      color: #000;
    }

    .bill-to-section {
      gap: 8px;
      align-items: flex-start;
      align-self: start;
    }

    .invoice-details-section {
      align-items: flex-start;
      align-self: start;
    }

    .bill-to-customer-name {
      font-size: 15px;
      font-weight: 500;
      color: #000;
      line-height: 1.45;
      text-align: inherit;
      min-width: 0;
      flex: 1 1 auto;
      white-space: normal;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
    }

    .bill-to-invoice-type {
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
      align-self: center;
    }

    .customer-name-highlight {
      font-size: 15px;
      font-weight: 800;
      color: #000;
      text-align: inherit;
    }

    .bill-to-meta {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      align-self: flex-start;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
      text-align: start;
    }

    .payment-type-label {
      font-size: 14px;
      margin: 0;
    }

    .payment-type-label::after {
      content: ':';
      margin-inline-start: 2px;
    }

    .company-contact-line {
      display: inline-block;
      margin-top: 4px;
      font-size: 19px;
      color: #000;
    }

    .company-contact-line .contact-label {
      font-weight: 700;
      color: #000;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border: 2px solid black;
    }
    
    .items-table th {

      padding: 12px 8px;
      text-align: ${startAlign};
      font-weight: 800;
      font-size: 17px;
      border: 1px solid #0056b3;
      border-bottom: 2px solid #0056b3;
    }
    
    .items-table th:first-child {
      border-radius: 0 8px 0 0;
    }
    
    .items-table th:last-child {
      border-radius: 8px 0 0 0;
      text-align: ${endAlign};
    }
    
    .items-table td {
      padding: 12px 8px;
      border: 1px solid #dee2e6;
      border-bottom: 1px solid #dee2e6;
      vertical-align: top;
      font-size: 16px;
    }
    
    .items-table tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .items-table tr:hover {
      background: #e3f2fd;
    }
    
    .items-table tbody tr:last-child td {
      border-bottom: 2px solid black;
    }

    .invoice-print-page {
      position: relative;
    }

    .invoice-print-page-break {
      page-break-after: always;
    }

    .continuation-banner {
      margin: 0 0 18px;
      padding: 10px 14px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      font-size: 13px;
    }

    .page-items-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      align-items: baseline;
      margin: 14px 0 10px;
      font-size: 12px;
      color: #6c757d;
      font-variant-numeric: tabular-nums;
    }

    @media print {
      .items-table thead {
        display: table-header-group;
      }
      .items-table tr {
        page-break-inside: avoid;
      }
    }
    
    .items-table .text-right {
      text-align: ${endAlign};
    }
    
    .items-table .text-center {
      text-align: center;
    }
    
    .items-table .text-left {
      text-align: ${startAlign};
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 30px;
    }
    
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      padding-top: 20px;
      margin-top: 20px;
      margin-bottom: 20px;
    }

    .totals-table {
      width: 400px;
      border-collapse: collapse;
      border: 2px solid black;
      border-radius: 8px;
      overflow: hidden;
    }

    .totals-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e9ecef;
      font-size: 16px;
    }
    
    .totals-table .total-label {
      font-weight: 700;
      text-align: ${endAlign};
      background: #f8f9fa;
      border-right: 1px solid #dee2e6;
    }
    
    .totals-table .total-amount {
      text-align: ${startAlign};
      font-weight: 600;
      background: white;
    }
    
    .totals-table .final-total {
      background: white;
      color: black;
      font-weight: bold;
      font-size: 18px;
      border-bottom: none;
    }
    
    .totals-table .final-total .total-label,
    .totals-table .final-total .total-amount {
      background: white;
      color: black;
      border-right: none;
    }
    
    .payment-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
    }
    
    .barcode-section {
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      border: 2px dashed #ccc;
      border-radius: 8px;
    }
    
    .barcode {
      font-family: 'Libre Barcode 39', 'Courier New', monospace;
      font-size: 32px;
      letter-spacing: 2px;
      margin: 10px 0;
      font-weight: normal;
      direction: ltr;
    }
    
    .barcode-text {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    
    .notes-section {
      margin: 30px 0;
      padding: 15px;
      background: #f8f9fa;
      border-right: 4px solid black;
      border-radius: 8px 0 0 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .terms-heading {
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 17px;
    }

    .notes-section .notes-content {
      font-size: 15px;
      line-height: 1.5;
      white-space: normal;
      word-break: break-word;
    }

    .notes-section .notes-content div {
      margin-bottom: 4px;
    }

    .notes-section .notes-content b,
    .notes-section .notes-content strong {
      font-weight: bold;
    }

    .notes-section .notes-content i,
    .notes-section .notes-content em {
      font-style: italic;
    }

    .notes-section .notes-content u {
      text-decoration: underline;
    }

    .notes-section .notes-content ul,
    .notes-section .notes-content ol {
      margin: 6px 0;
      padding-left: 20px;
    }

    .invoice-branch-note {
      margin: 24px 0 0;
      padding: 16px;
      background: #fafafa;
      border: 1px dashed #ccc;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      line-height: 1.45;
      white-space: normal;
      word-break: break-word;
    }
    
    .footer {
      text-align: center;
      font-size: 13px;
      color: #666;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e9ecef;
    }

    .footer-line {
      margin-bottom: 5px;
    }

    .footer-thank-you {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    }

    .no-print {
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .print-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      width: 100%;
    }
    
    .print-btn {
      padding: 10px 20px;
      margin: 0;
      font-size: 14px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-family: inherit;
    }
    
    .print-btn-primary {
      background: #007bff;
      color: white;
    }
    
    .print-btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .status-cash {
      background: #d4edda;
      color: #155724;
    }
    
    .status-credit {
      background: #cce5ff;
      color: #004085;
    }
    
    .status-pending {
      background: #fff3cd;
      color: #856404;
    }
    
    @media screen {
      body {
        max-width: 800px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        padding: 40px;
        border-radius: 12px;
      }
    }
    ${INVOICE_TEMPLATE_CSS[template] ?? ''}
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="invoice-print-root">
  ${pagesHtml}
  </div>
  ${printActions}
</body>
</html>
  `.trim()
}

function extractA4PrintBodyInner(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (!bodyMatch) return ''
  const inner = bodyMatch[1]
  const npIdx = inner.search(/<div class="no-print"/i)
  if (npIdx === -1) return inner.trim()
  return inner.slice(0, npIdx).trim()
}

/**
 * Wraps two column bodies (each already-extracted `<body>` inner HTML, or '' for a blank
 * half) into one landscape-A4 page, split 50/50 with a dashed cut guide down the middle and
 * content anchored to the top of each half — so a printer loaded only with A4 stock can
 * carry two A5-proportioned invoices per physical sheet.
 */
function buildA4TwoUpPageHTML(headSource: string, leftBodyHtml: string, rightBodyHtml: string, noPrintLabel: string): string {
  const headEnd = headSource.indexOf('</head>')
  const head = headEnd === -1 ? headSource : headSource.slice(0, headEnd + 7)

  const extraCss = `
    @media print {
      @page { size: A4 landscape; margin: 8mm; }
    }
    .a4-two-up {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .a4-two-up-col {
      flex: 1 1 50%;
      max-width: 50%;
      box-sizing: border-box;
      padding: 0 10px;
    }
    .a4-two-up-col + .a4-two-up-col {
      border-left: 1px dashed #bbb;
    }
    body {
      max-width: none !important;
      margin: 0 auto !important;
      padding: 12px !important;
    }
    @media screen {
      body {
        box-shadow: none !important;
        border: none !important;
        max-width: 1200px !important;
      }
    }
  `
  const mergedHead = head.includes('</style>')
    ? head.replace('</style>', `${extraCss}\n  </style>`)
    : head

  return `${mergedHead}
<body>
  <div class="a4-two-up">
    <div class="a4-two-up-col">${leftBodyHtml}</div>
    <div class="a4-two-up-col">${rightBodyHtml}</div>
  </div>
  <div class="no-print">
    <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">${noPrintLabel}</div>
    <div class="print-actions">
      <button type="button" onclick="window.print()" class="print-btn print-btn-primary">Print</button>
      <button type="button" onclick="window.close()" class="print-btn print-btn-secondary">Close</button>
    </div>
  </div>
</body>
</html>`
}

/**
 * Landscape A4 with two (different) invoices side by side, half width each — prints two
 * A5-proportioned invoices on a single A4 sheet from a printer that only carries A4 stock.
 * Long invoices may still span multiple sheets; preview before printing.
 */
export function generateA4LandscapeTwoInvoicesHTML(
  left: PrintInvoiceData,
  right: PrintInvoiceData,
  template: InvoiceTemplate = 'standard',
): string {
  const leftFull = generateA4InvoiceHTML(left, 'a4', template)
  const bodyLeft = extractA4PrintBodyInner(leftFull)
  const bodyRight = extractA4PrintBodyInner(generateA4InvoiceHTML(right, 'a4', template))
  return buildA4TwoUpPageHTML(leftFull, bodyLeft, bodyRight, 'Print (landscape 2-up)')
}

/**
 * One invoice printed into just the left or right half of a landscape A4 sheet, top-aligned,
 * with the other half left blank. Print one invoice to the left half, feed the same physical
 * sheet back into the printer, then print a second invoice to the right half — two invoices
 * end up on one A4 sheet without needing both at once.
 */
export function generateA4HalfLandscapeInvoiceHTML(
  data: PrintInvoiceData,
  half: 'left' | 'right' = 'left',
  template: InvoiceTemplate = 'standard',
): string {
  const full = generateA4InvoiceHTML(data, 'a4', template)
  const body = extractA4PrintBodyInner(full)
  const label = half === 'left' ? 'Print (left half of A4 sheet)' : 'Print (right half of A4 sheet)'
  return half === 'left'
    ? buildA4TwoUpPageHTML(full, body, '', label)
    : buildA4TwoUpPageHTML(full, '', body, label)
}

/** Opens a blob-URL print window sized/timed for the given paper format. */
export const openPrintWindowForFormat = (
  htmlContent: string,
  paperSize: PaperFormatKey,
  contact?: PrintWindowContact,
): void => {
  ensureInvoicePrintContactBridge()
  ensureInvoiceWhatsAppSendBridge()
  ensureInvoicePrintPdfBridge()
  ensureInvoiceSmsSendBridge()
  if (contact) stashPrintContact(contact)

  const format = PAPER_FORMATS[paperSize]
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(
    blobUrl,
    '_blank',
    `width=${format.popup.width},height=${format.popup.height},scrollbars=yes,resizable=yes`,
  )

  if (!printWindow) {
    URL.revokeObjectURL(blobUrl)
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }

  printWindow.addEventListener(
    'load',
    () => {
      URL.revokeObjectURL(blobUrl)
      if (isElectronApp()) return
      setTimeout(() => {
        try {
          printWindow.print()
        } catch (error) {
          console.error('Print error:', error)
        }
      }, format.printDelayMs)
    },
    { once: true },
  )
}

/** @deprecated Use `openPrintWindowForFormat(html, paperSize, contact)`. Kept for callers not yet migrated. */
export const openPrintWindow = (htmlContent: string, contact?: PrintWindowContact): void =>
  openPrintWindowForFormat(htmlContent, 'thermal80', contact)

/** @deprecated Use `openPrintWindowForFormat(html, paperSize, contact)`. Kept for callers not yet migrated. */
export const openA4PrintWindow = (htmlContent: string, contact?: PrintWindowContact): void =>
  openPrintWindowForFormat(htmlContent, 'a4', contact)
