import { formatCurrency } from '@/features/invoice/utils/print-utils'
import { escapeHtml } from '@/lib/escape-html'
import { PAPER_FORMATS } from '@/features/invoice/utils/paper-format'

export type LedgerStatementLanguage = 'en' | 'ur'

export interface LedgerStatementItem {
  name: string
  nameUrdu?: string | null
  quantity: number
  unit?: string
  unitPrice: number
  subtotal: number
}

export interface LedgerStatementRow {
  date: string | Date
  /** Raw ledger transaction type (e.g. 'sale', 'payment_received', 'sales_return', 'opening_balance', ...). */
  transactionType: string
  /** Manual accounts entry (Add Entry), not auto-generated from an invoice/payment flow. */
  isManual?: boolean
  description?: string
  reference?: string
  /** Sale terms: cash / credit / pending. */
  invoiceType?: string
  debit: number
  credit: number
  balance: number
  /** Product lines for this row (Sale invoices only). Omitted rows print as a single summary line. */
  items?: LedgerStatementItem[]
}

export interface CustomerLedgerStatementData {
  customerName: string
  customerNameUrdu?: string
  customerPhone?: string
  customerAddress?: string
  startDate: string | Date
  endDate: string | Date
  openingBalance: number
  rows: LedgerStatementRow[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
  companyName?: string
  companyNameUrdu?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLogo?: string
  isTrial?: boolean
  /** Print language; defaults to English. */
  language?: LedgerStatementLanguage
  /** Show invoice/reference numbers on the printed statement. Defaults to true. */
  showInvoiceNumbers?: boolean
}

const statementLabels = {
  en: {
    statement_title: 'Customer Statement',
    generated: 'Generated',
    customer: 'Customer',
    statement_period: 'Statement Period',
    opening_balance: 'Opening Balance',
    total_debit: 'Total Amount',
    total_credit: 'Received Payment',
    closing_balance: 'Total Balance',
    col_number: '#',
    col_date: 'Date',
    col_ref: 'Invoice #',
    col_product: 'Product',
    col_qty: 'Qty',
    col_rate: 'Rate',
    col_amount: 'Amount',
    balance_brought_forward: 'Balance Brought Forward',
    invoice_total: 'Invoice Total',
    previous_balance: 'Previous Balance',
    total_debit_period: 'Total Amount',
    total_credit_period: 'Received Payment',
    total_remaining: 'Total Balance',
    receivable: 'Receivable',
    payable: 'Payable',
    ref_prefix: 'Ref',
    footer_note: 'This is a system-generated customer statement.',
    print_options: 'Print options',
    print_statement: 'Print statement',
    close: 'Close',
    cash: 'Cash',
    credit: 'Credit',
    pending: 'Pending',
    type_sale: 'Sale',
    type_sale_manual: 'Cash Paid',
    type_payment_received: 'Payment Received',
    type_payment_received_manual: 'Cash Received',
    type_sales_return: 'Sales Return',
    type_credit_note: 'Credit Note',
    type_debit_note: 'Debit Note',
    type_adjustment: 'Adjustment',
    type_opening_balance: 'Opening Balance',
    type_refund: 'Refund',
  },
  ur: {
    statement_title: 'کسٹمر اسٹیٹمنٹ',
    generated: 'تیار کردہ',
    customer: 'کسٹمر',
    statement_period: 'اسٹیٹمنٹ کی مدت',
    opening_balance: 'ابتدائی بیلنس',
    total_debit: 'کل رقم',
    total_credit: 'وصول شدہ ادائیگی',
    closing_balance: 'کل بیلنس',
    col_number: '#',
    col_date: 'تاریخ',
    col_ref: 'انوائس نمبر',
    col_product: 'پروڈکٹ',
    col_qty: 'مقدار',
    col_rate: 'ریٹ',
    col_amount: 'رقم',
    balance_brought_forward: 'سابقہ بیلنس',
    invoice_total: 'انوائس کل رقم',
    previous_balance: 'پچھلا بیلنس',
    total_debit_period: 'کل رقم',
    total_credit_period: 'وصول شدہ ادائیگی',
    total_remaining: 'کل بیلنس',
    receivable: 'وصولی',
    payable: 'ادائیگی',
    ref_prefix: 'حوالہ',
    footer_note: 'یہ کمپیوٹر سے تیار کردہ کسٹمر اسٹیٹمنٹ ہے۔',
    print_options: 'پرنٹ آپشنز',
    print_statement: 'اسٹیٹمنٹ پرنٹ کریں',
    close: 'بند کریں',
    cash: 'کیش',
    credit: 'ادھار',
    pending: 'زیر التوا',
    type_sale: 'فروخت',
    type_sale_manual: 'نقد ادائیگی',
    type_payment_received: 'ادائیگی وصول',
    type_payment_received_manual: 'نقد وصولی',
    type_sales_return: 'واپسی',
    type_credit_note: 'کریڈٹ نوٹ',
    type_debit_note: 'ڈیبٹ نوٹ',
    type_adjustment: 'ایڈجسٹمنٹ',
    type_opening_balance: 'ابتدائی بیلنس',
    type_refund: 'رقم واپسی',
  },
} as const

type StatementLabels = { [K in keyof typeof statementLabels.en]: string }

const fmtDate = (d: string | Date, locale: string) =>
  new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

const balanceLabel = (balance: number, labels: StatementLabels): string => {
  const amount = formatCurrency(Math.abs(balance))
  if (Math.abs(balance) < 0.005) return amount
  return balance > 0 ? `${amount} (${labels.receivable})` : `${amount} (${labels.payable})`
}

const balanceClass = (balance: number): string => {
  if (Math.abs(balance) < 0.005) return ''
  return balance > 0 ? 'balance-receivable' : 'balance-payable'
}

/**
 * A4 customer statement: date-ranged ledger print with Sale invoices expanded
 * product-wise (Qty / Rate / Amount per line), other entries as summary rows,
 * opening balance carried forward and a closing "total remaining" footer.
 * Supports English/Urdu print language and an invoice-number visibility toggle.
 */
export function generateCustomerLedgerStatementHTML(
  data: CustomerLedgerStatementData,
  sheetSize: 'a4' | 'a5' = 'a4',
): string {
  const format = PAPER_FORMATS[sheetSize]
  const {
    customerName,
    customerNameUrdu,
    customerPhone,
    customerAddress,
    startDate,
    endDate,
    openingBalance,
    rows,
    totalDebit,
    totalCredit,
    closingBalance,
    companyName,
    companyNameUrdu,
    companyAddress,
    companyPhone,
    companyEmail,
    companyLogo,
    isTrial,
  } = data

  const language: LedgerStatementLanguage = data.language === 'ur' ? 'ur' : 'en'
  const showInvoiceNumbers = data.showInvoiceNumbers !== false
  const labels = statementLabels[language]
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const startAlign = language === 'ur' ? 'right' : 'left'

  const businessName = (language === 'ur' && companyNameUrdu?.trim()) || companyName?.trim() || 'Business'
  const displayCustomerName = (language === 'ur' && customerNameUrdu?.trim()) || customerName
  const now = new Date()

  const bodyRows: string[] = []
  let itemIdx = 0

  rows.forEach((row) => {
    const items = row.items ?? []
    if (items.length === 0) return
    const ref = showInvoiceNumbers && row.reference ? escapeHtml(row.reference) : '—'

    items.forEach((item, j) => {
      itemIdx += 1
      const itemName = (language === 'ur' && item.nameUrdu?.trim()) || item.name
      const rowClass = j === 0 ? 'item-row invoice-start' : 'item-row'
      bodyRows.push(`
        <tr class="${rowClass}">
          <td class="text-center">${itemIdx}</td>
          <td>${j === 0 ? fmtDate(row.date, locale) : ''}</td>
          <td class="text-center">${j === 0 ? ref : ''}</td>
          <td class="text-left">${escapeHtml(itemName)}</td>
          <td class="text-center">${item.quantity}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}</td>
          <td class="text-right">${formatCurrency(item.unitPrice)}</td>
          <td class="text-right">${formatCurrency(item.subtotal)}</td>
        </tr>`)
    })
  })

  if (bodyRows.length === 0) {
    bodyRows.push(`<tr><td colspan="7" class="text-center">—</td></tr>`)
  }

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}" translate="no" class="notranslate">
<head>
  <meta charset="UTF-8">
  <meta name="google" content="notranslate">
  <title>${labels.statement_title} — ${escapeHtml(customerName)}</title>
  <style>
    @media print {
      @page { margin: ${format.pageMargin}; size: ${format.pageCss}; }
      body { margin: 0; padding: 0; font-size: ${format.baseFontPx - 1}px; }
      .no-print { display: none !important; }
    }

    body {
      font-family: 'Inter', 'Manrope', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: ${format.baseFontPx}px;
      line-height: 1.4;
      margin: 0;
      padding: 20px;
      background: #fff;
      color: #000;
      direction: ${dir};
      text-align: ${startAlign};
    }

    .statement-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      border-bottom: 3px solid #000;
      padding-bottom: 14px;
    }

    .company-logo { max-width: 130px; height: auto; margin-bottom: 8px; display: block; }
    .company-name { font-size: 22px; font-weight: bold; color: #007bff; margin-bottom: 4px; }
    .company-details { font-size: 11px; color: #000; line-height: 1.3; }

    .statement-title-block { text-align: ${language === 'ur' ? 'left' : 'right'}; }
    .statement-title { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 8px; }
    .statement-meta { font-size: 11px; color: #555; }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 32px;
      margin-bottom: 18px;
      padding: 14px 18px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .info-title { font-weight: bold; font-size: 13px; color: #333; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #dee2e6; }
    .info-line { font-size: 12px; margin-bottom: 2px; }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
    .summary-card .label { font-size: 10px; color: #666; margin-bottom: 3px; }
    .summary-card .value { font-size: 13px; font-weight: bold; }

    table.statement-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    table.statement-table thead { display: table-header-group; }
    table.statement-table th {
      background: #f1f3f5;
      border: 1px solid #ccc;
      padding: 6px 5px;
      font-size: 10px;
      text-transform: ${language === 'ur' ? 'none' : 'uppercase'};
      letter-spacing: 0.02em;
    }
    table.statement-table td {
      border: 1px solid #e0e0e0;
      padding: 5px;
      font-size: 11px;
      vertical-align: top;
    }
    table.statement-table tr { page-break-inside: avoid; }
    .text-center { text-align: center; }
    .text-left { text-align: ${startAlign}; }
    .text-right { text-align: ${language === 'ur' ? 'left' : 'right'}; }
    .item-row td { color: #333; }
    .item-row.invoice-start td { border-top: 2px solid #999; }

    .balance-receivable { color: #c0392b; }
    .balance-payable { color: #1e8449; }

    .closing-summary {
      display: flex;
      justify-content: ${language === 'ur' ? 'flex-start' : 'flex-end'};
      margin-bottom: 18px;
    }
    table.totals-table { width: 320px; border-collapse: collapse; }
    table.totals-table td { padding: 6px 10px; font-size: 12px; }
    table.totals-table .total-label { color: #555; }
    table.totals-table .total-amount { text-align: ${language === 'ur' ? 'left' : 'right'}; font-weight: 600; }
    table.totals-table .grand-total td { border-top: 2px solid #000; font-size: 15px; font-weight: bold; padding-top: 10px; }

    .footer { margin-top: 24px; text-align: center; color: #666; font-size: 11px; border-top: 1px solid #ddd; padding-top: 10px; }

    .no-print { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn { padding: 8px 16px; margin: 0 5px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
  </style>
</head>
<body>
  <div class="statement-header">
    <div>
      ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(businessName)}" class="company-logo" />` : isTrial ? `<img src="/images/logo-light.png" alt="Logo" class="company-logo" />` : ''}
      <div class="company-name">${escapeHtml(businessName)}</div>
      <div class="company-details">
        ${companyAddress ? `${escapeHtml(companyAddress)}<br>` : ''}
        ${[companyPhone, companyEmail].filter((v): v is string => Boolean(v)).map(escapeHtml).join(' · ')}
      </div>
    </div>
    <div class="statement-title-block">
      <div class="statement-title">${labels.statement_title}</div>
      <div class="statement-meta">${labels.generated}: ${now.toLocaleDateString(locale)} ${now.toLocaleTimeString(locale)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div>
      <div class="info-title">${labels.customer}</div>
      <div class="info-line"><strong>${escapeHtml(displayCustomerName)}</strong></div>
      ${customerPhone ? `<div class="info-line">${escapeHtml(customerPhone)}</div>` : ''}
      ${customerAddress ? `<div class="info-line">${escapeHtml(customerAddress)}</div>` : ''}
    </div>
    <div>
      <div class="info-title">${labels.statement_period}</div>
      <div class="info-line">${fmtDate(startDate, locale)} — ${fmtDate(endDate, locale)}</div>
    </div>
  </div>

  <div class="summary-cards">
    <div class="summary-card">
      <div class="label">${labels.opening_balance}</div>
      <div class="value ${balanceClass(openingBalance)}">${balanceLabel(openingBalance, labels)}</div>
    </div>
    <div class="summary-card">
      <div class="label">${labels.total_debit}</div>
      <div class="value balance-receivable">${formatCurrency(totalDebit)}</div>
    </div>
    <div class="summary-card">
      <div class="label">${labels.total_credit}</div>
      <div class="value balance-payable">${formatCurrency(totalCredit)}</div>
    </div>
    <div class="summary-card">
      <div class="label">${labels.closing_balance}</div>
      <div class="value ${balanceClass(closingBalance)}">${balanceLabel(closingBalance, labels)}</div>
    </div>
  </div>

  <table class="statement-table">
    <thead>
      <tr>
        <th style="width: 5%;">${labels.col_number}</th>
        <th style="width: 12%;">${labels.col_date}</th>
        <th style="width: 15%;">${labels.col_ref}</th>
        <th style="width: 35%;">${labels.col_product}</th>
        <th style="width: 11%;">${labels.col_qty}</th>
        <th style="width: 11%;">${labels.col_rate}</th>
        <th style="width: 11%;">${labels.col_amount}</th>
      </tr>
    </thead>
    <tbody>${bodyRows.join('')}</tbody>
  </table>

  <div class="closing-summary">
    <table class="totals-table">
      <tr>
        <td class="total-label">${labels.previous_balance}:</td>
        <td class="total-amount">${balanceLabel(openingBalance, labels)}</td>
      </tr>
      <tr>
        <td class="total-label">${labels.total_debit_period}:</td>
        <td class="total-amount">${formatCurrency(totalDebit)}</td>
      </tr>
      <tr>
        <td class="total-label">${labels.total_credit_period}:</td>
        <td class="total-amount">${formatCurrency(totalCredit)}</td>
      </tr>
      <tr class="grand-total">
        <td class="total-label">${labels.total_remaining}:</td>
        <td class="total-amount ${balanceClass(closingBalance)}">${balanceLabel(closingBalance, labels)}</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    ${labels.footer_note}
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${labels.print_options}</div>
    <button type="button" onclick="window.print()" class="print-btn print-btn-primary">${labels.print_statement}</button>
    <button type="button" onclick="window.close()" class="print-btn print-btn-secondary">${labels.close}</button>
  </div>
</body>
</html>`
}
