import { formatCurrency } from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS, type SheetSize } from '@/features/invoice/utils/paper-format'
import { escapeHtml } from '@/lib/escape-html'
import { formatAppDate } from '@/lib/date-format'
import type { CurrencyOption } from '@/stores/localization.api'

export type BankStatementLanguage = 'en' | 'ur'
export type BankStatementParty = 'customer' | 'supplier'

export interface BankStatementRow {
  date: string | Date
  transactionType: string
  /** Added by hand via Accounts → Add Entry. */
  isManual?: boolean
  description?: string
  reference?: string
  /** cash / credit / pending, for sales and purchases. */
  invoiceType?: string
  debit: number
  credit: number
  /** Running balance after this row. */
  balance: number
  /** Product lines, printed under the entry in the product-wise layout (sale invoices). */
  items?: BankStatementItem[]
}

export interface BankStatementItem {
  name: string
  nameUrdu?: string | null
  quantity: number
  unit?: string
  unitPrice: number
  /** Line amount, net of any line discount. */
  subtotal: number
  discountAmount?: number
}

export interface BankStatementData {
  party: BankStatementParty
  accountName: string
  accountNameUrdu?: string
  accountPhone?: string
  accountAddress?: string
  /** "YYYY-MM-DD" business dates. */
  periodStart: string
  periodEnd: string
  /** Period starts at the very beginning of the account. */
  allTime?: boolean
  openingBalance: number
  rows: BankStatementRow[]
  companyName?: string
  companyNameUrdu?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLogo?: string
  language?: BankStatementLanguage
  showReferences?: boolean
  currencyMeta?: CurrencyOption
  /** 'products' lists each sale's items (qty × rate) under its entry. */
  layout?: 'bank' | 'products'
}

const labels = {
  en: {
    title: 'Statement of Account',
    title_products: 'Statement of Account — Product-wise',
    item_product: 'Product',
    item_qty: 'Qty',
    item_rate: 'Rate',
    item_amount: 'Amount',
    col_type: 'Type',
    col_invoice: 'Invoice #',
    col_product: 'Product / Details',
    col_qty: 'Qty',
    col_price: 'Price',
    bill_adjustment: 'Bill adjustment (discount / tax / charges)',
    codes_title: 'Type codes',
    short_types: {
      sale: 'Sale',
      sale_manual: 'CP',
      payment_received: 'CV',
      payment_received_manual: 'CV',
      sales_return: 'SR',
      purchase: 'PUR',
      payment_made: 'PV',
      payment: 'PV',
      purchase_return: 'PR',
      credit_note: 'CN',
      debit_note: 'DN',
      adjustment: 'ADJ',
      opening_balance: 'OB',
      refund: 'RF',
    } as Record<string, string>,
    code_meanings: {
      Sale: 'Sale invoice',
      CP: 'Cash paid to customer',
      CV: 'Cash / payment received',
      SR: 'Sales return',
      PUR: 'Purchase',
      PV: 'Payment voucher',
      PR: 'Purchase return',
      CN: 'Credit note',
      DN: 'Debit note',
      ADJ: 'Adjustment',
      OB: 'Opening balance',
      RF: 'Refund',
    } as Record<string, string>,
    account_holder: 'Account Holder',
    account_type: 'Account Type',
    customer_account: 'Customer Account',
    supplier_account: 'Supplier Account',
    period: 'Statement Period',
    beginning: 'Beginning',
    issued: 'Statement Date',
    phone: 'Phone',
    address: 'Address',
    summary: 'Account Summary',
    opening: 'Opening Balance',
    total_debit: 'Total Debits',
    total_credit: 'Total Credits',
    closing: 'Closing Balance',
    entries: 'entries',
    entries_label: 'Entries',
    col_date: 'Date',
    col_details: 'Transaction Details',
    col_ref: 'Reference',
    ref_prefix: 'Ref',
    col_debit: 'Debit',
    col_credit: 'Credit',
    col_balance: 'Balance',
    brought_forward: 'Opening balance brought forward',
    carried_forward: 'Closing balance',
    no_activity: 'No transactions in this period.',
    dr: 'Dr',
    cr: 'Cr',
    customer_note: 'Dr = amount you owe us · Cr = amount we owe you',
    supplier_note: 'Cr = amount we owe you · Dr = amount you owe us',
    footer: 'This is a computer-generated statement and does not require a signature. Please report any discrepancy promptly.',
    print: 'Print',
    close: 'Close',
    cash: 'Cash',
    credit: 'Credit',
    pending: 'Pending',
    types: {
      sale: 'Sale',
      sale_manual: 'Cash Paid',
      payment_received: 'Payment Received',
      payment_received_manual: 'Cash Received',
      sales_return: 'Sales Return',
      purchase: 'Purchase',
      payment_made: 'Payment Made',
      payment: 'Payment',
      purchase_return: 'Purchase Return',
      credit_note: 'Credit Note',
      debit_note: 'Debit Note',
      adjustment: 'Adjustment',
      opening_balance: 'Opening Balance',
      refund: 'Refund',
    } as Record<string, string>,
  },
  ur: {
    title: 'کھاتہ اسٹیٹمنٹ',
    title_products: 'کھاتہ اسٹیٹمنٹ — پروڈکٹ وار',
    item_product: 'پروڈکٹ',
    item_qty: 'مقدار',
    item_rate: 'ریٹ',
    item_amount: 'رقم',
    col_type: 'قسم',
    col_invoice: 'انوائس نمبر',
    col_product: 'پروڈکٹ / تفصیل',
    col_qty: 'مقدار',
    col_price: 'ریٹ',
    bill_adjustment: 'بل ایڈجسٹمنٹ (رعایت / ٹیکس / اخراجات)',
    codes_title: '',
    short_types: {
      sale: 'فروخت',
      sale_manual: 'ادائیگی',
      payment_received: 'وصولی',
      payment_received_manual: 'وصولی',
      sales_return: 'واپسی',
      purchase: 'خریداری',
      payment_made: 'ادائیگی',
      payment: 'ادائیگی',
      purchase_return: 'واپسی',
      credit_note: 'کریڈٹ نوٹ',
      debit_note: 'ڈیبٹ نوٹ',
      adjustment: 'ایڈجسٹمنٹ',
      opening_balance: 'ابتدائی',
      refund: 'رقم واپسی',
    } as Record<string, string>,
    code_meanings: {} as Record<string, string>,
    account_holder: 'کھاتہ دار',
    account_type: 'کھاتے کی قسم',
    customer_account: 'کسٹمر کھاتہ',
    supplier_account: 'سپلائر کھاتہ',
    period: 'اسٹیٹمنٹ کی مدت',
    beginning: 'آغاز سے',
    issued: 'اسٹیٹمنٹ کی تاریخ',
    phone: 'فون',
    address: 'پتہ',
    summary: 'کھاتے کا خلاصہ',
    opening: 'ابتدائی بیلنس',
    total_debit: 'کل بنام',
    total_credit: 'کل جمع',
    closing: 'اختتامی بیلنس',
    entries: 'اندراجات',
    entries_label: 'اندراجات',
    col_date: 'تاریخ',
    col_details: 'تفصیل',
    col_ref: 'حوالہ',
    ref_prefix: 'حوالہ',
    col_debit: 'بنام',
    col_credit: 'جمع',
    col_balance: 'بیلنس',
    brought_forward: 'سابقہ بیلنس',
    carried_forward: 'اختتامی بیلنس',
    no_activity: 'اس مدت میں کوئی لین دین نہیں۔',
    dr: 'بنام',
    cr: 'جمع',
    customer_note: 'بنام = آپ کے ذمے واجب الادا رقم · جمع = ہماری طرف سے آپ کو واجب الادا رقم',
    supplier_note: 'جمع = ہماری طرف سے آپ کو واجب الادا رقم · بنام = آپ کے ذمے واجب الادا رقم',
    footer: 'یہ کمپیوٹر سے تیار کردہ اسٹیٹمنٹ ہے، دستخط کی ضرورت نہیں۔ کسی فرق کی صورت میں فوراً مطلع کریں۔',
    print: 'پرنٹ کریں',
    close: 'بند کریں',
    cash: 'نقد',
    credit: 'ادھار',
    pending: 'زیر التوا',
    types: {
      sale: 'فروخت',
      sale_manual: 'نقد ادائیگی',
      payment_received: 'وصولی',
      payment_received_manual: 'نقد وصولی',
      sales_return: 'فروخت واپسی',
      purchase: 'خریداری',
      payment_made: 'ادائیگی',
      payment: 'ادائیگی',
      purchase_return: 'خریداری واپسی',
      credit_note: 'کریڈٹ نوٹ',
      debit_note: 'ڈیبٹ نوٹ',
      adjustment: 'ایڈجسٹمنٹ',
      opening_balance: 'ابتدائی بیلنس',
      refund: 'رقم واپسی',
    } as Record<string, string>,
  },
}

const FONT_STACK = `'Inter', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap'

const isZero = (n: number) => Math.abs(n) < 0.005

/** "YYYY-MM-DD" → local date without the UTC shift. */
const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const humanize = (type: string) =>
  type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Bank-style A4/A5 statement of account: account-holder panel, account summary, and a
 * Date / Details / Reference / Debit / Credit / running Balance register bracketed by the
 * opening balance brought forward and the closing balance. Works for customers (positive
 * balance = Dr, receivable) and suppliers (positive balance = Cr, payable).
 */
export function generateLedgerBankStatementHTML(data: BankStatementData, sheetSize: SheetSize = 'a4'): string {
  const format = PAPER_FORMATS[sheetSize]
  const language: BankStatementLanguage = data.language === 'ur' ? 'ur' : 'en'
  const L = labels[language]
  const isUrdu = language === 'ur'
  const dir = isUrdu ? 'rtl' : 'ltr'
  const start = isUrdu ? 'right' : 'left'
  const end = isUrdu ? 'left' : 'right'
  const showRefs = data.showReferences !== false
  const products = data.layout === 'products'
  const money = (n: number) => formatCurrency(Math.abs(n), data.currencyMeta)

  // Customer: positive = they owe us = Dr. Supplier: positive = we owe them = Cr.
  const balanceSide = (balance: number) => {
    if (isZero(balance)) return ''
    const owed = balance > 0
    const isDr = data.party === 'customer' ? owed : !owed
    return isDr ? L.dr : L.cr
  }
  const balanceCell = (balance: number) => {
    const side = balanceSide(balance)
    return `<span class="num">${money(balance)}</span>${side ? `<span class="side">${side}</span>` : ''}`
  }

  const rows = data.rows
  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const debitCount = rows.filter((r) => Number(r.debit) > 0).length
  const creditCount = rows.filter((r) => Number(r.credit) > 0).length
  const closingBalance = rows.length ? Number(rows[rows.length - 1].balance) || 0 : data.openingBalance

  const businessName = (isUrdu && data.companyNameUrdu?.trim()) || data.companyName?.trim() || 'Business'
  const accountName = (isUrdu && data.accountNameUrdu?.trim()) || data.accountName
  const periodText = `${data.allTime ? L.beginning : formatAppDate(keyToDate(data.periodStart))} — ${formatAppDate(keyToDate(data.periodEnd))}`
  const now = new Date()

  const typeLabel = (row: BankStatementRow) => {
    const key = row.isManual && L.types[`${row.transactionType}_manual`] ? `${row.transactionType}_manual` : row.transactionType
    let label = L.types[key] || humanize(row.transactionType)
    const terms = row.invoiceType && (L as any)[row.invoiceType]
    if (terms && (row.transactionType === 'sale' || row.transactionType === 'purchase') && !row.isManual) {
      label += ` · ${terms}`
    }
    return label
  }

  const colCount = 5

  // No separate Reference column: the invoice/receipt number usually already sits in the
  // description ("Bill sent to party - Bill #BILL-…"), so only add it when it doesn't.
  const refLine = (row: BankStatementRow, desc?: string) => {
    const ref = row.reference?.trim()
    if (!showRefs || !ref || desc?.includes(ref.replace(/^bill\s*#?/i, ''))) return ''
    return `<div class="desc">${L.ref_prefix}: <span class="ltr">${escapeHtml(ref)}</span></div>`
  }

  const amountCell = (n: number) => (isZero(n) ? '' : `<span class="num">${n < 0 ? '-' : ''}${money(n)}</span>`)
  // Product-wise has 9 columns: print bare figures and name the currency once in the headers.
  const decimals = data.currencyMeta?.decimalPlaces ?? 2
  const figure = (n: number) =>
    Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const figureCell = (n: number) => (isZero(n) ? '' : `<span class="num">${n < 0 ? '-' : ''}${figure(n)}</span>`)
  const figureBalance = (balance: number) => {
    const side = balanceSide(balance)
    return `<span class="num">${figure(balance)}</span>${side ? `<span class="side">${side}</span>` : ''}`
  }
  const cur = data.currencyMeta?.symbol?.trim()
  const withCur = (label: string) => (cur ? `${label} <span class="cur">(${escapeHtml(cur)})</span>` : label)

  // ---------- Bank layout: Date | Details | Debit | Credit | Balance ----------
  const bankBody = rows
    .map((row) => {
      const desc = row.description?.trim()
      return `
      <tr>
        <td class="c-date"><span class="ltr">${formatAppDate(new Date(row.date))}</span></td>
        <td class="c-details">
          <div class="type">${escapeHtml(typeLabel(row))}</div>
          ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
          ${refLine(row, desc)}
        </td>
        <td class="c-amt">${amountCell(Number(row.debit) || 0)}</td>
        <td class="c-amt">${amountCell(Number(row.credit) || 0)}</td>
        <td class="c-bal">${balanceCell(Number(row.balance) || 0)}</td>
      </tr>`
    })
    .join('')

  // ---------- Product-wise layout: one line per item sold ----------
  // Date | Type | Invoice # | Product / Details | Qty | Price | Debit | Credit | Balance.
  // Sales list each item with its amount in Debit; a "bill adjustment" line carries any
  // difference to the posted bill total (discount, tax, charges) so balances always add up.
  // Payments and other entries are one line, their details in the Product column.
  const shortType = (row: BankStatementRow) => {
    const manualKey = `${row.transactionType}_manual`
    const key = row.isManual && L.short_types[manualKey] ? manualKey : row.transactionType
    return L.short_types[key] || humanize(row.transactionType)
  }
  const invoiceNo = (row: BankStatementRow) => (row.reference?.trim() || '').replace(/^bill\s*#\s*/i, '')
  const usedCodes = new Set<string>()
  const pCols = showRefs ? 9 : 8

  const productBody = rows
    .map((row) => {
      const debit = Number(row.debit) || 0
      const credit = Number(row.credit) || 0
      const balance = Number(row.balance) || 0
      const type = shortType(row)
      usedCodes.add(type)
      const inv = invoiceNo(row)
      const items = row.items ?? []

      type Line = { product: string; qty?: string; price?: string; debit: number; credit: number; muted?: boolean }
      const lines: Line[] = []
      if (items.length) {
        let itemsTotal = 0
        items.forEach((item) => {
          const name = (isUrdu && item.nameUrdu?.trim()) || item.name
          const subtotal = Number(item.subtotal) || 0
          itemsTotal += subtotal
          lines.push({
            product: escapeHtml(name),
            qty: `<span class="num">${Number(item.quantity) || 0}</span>${item.unit ? ` ${escapeHtml(item.unit)}` : ''}`,
            price: `<span class="num">${figure(item.unitPrice)}</span>`,
            debit: subtotal,
            credit: 0,
          })
        })
        const diff = debit - itemsTotal
        if (!isZero(diff)) lines.push({ product: L.bill_adjustment, debit: diff, credit: 0, muted: true })
        if (!isZero(credit)) lines[lines.length - 1].credit = credit
      } else {
        const desc = row.description?.trim()
        lines.push({
          product: `<span class="type">${escapeHtml(typeLabel(row))}</span>${desc ? `<span class="desc-inline"> — ${escapeHtml(desc)}</span>` : ''}`,
          debit,
          credit,
        })
      }

      const span = lines.length
      return lines
        .map((line, idx) => {
          const first = idx === 0
          const last = idx === span - 1
          return `
      <tr class="${first ? 'grp' : 'sub'}${line.muted ? ' adj' : ''}">
        ${first ? `<td class="p-date" rowspan="${span}"><span class="ltr">${formatAppDate(new Date(row.date))}</span></td>
        <td class="p-type" rowspan="${span}">${escapeHtml(type)}</td>
        ${showRefs ? `<td class="p-inv" rowspan="${span}"><span class="ltr">${inv ? escapeHtml(inv) : '—'}</span></td>` : ''}` : ''}
        <td class="p-prod">${line.product}</td>
        <td class="p-n p-qty">${line.qty ?? ''}</td>
        <td class="p-n p-price">${line.price ?? ''}</td>
        <td class="p-n">${figureCell(line.debit)}</td>
        <td class="p-n">${figureCell(line.credit)}</td>
        <td class="p-bal">${last ? figureBalance(balance) : ''}</td>
      </tr>`
        })
        .join('')
    })
    .join('')

  const codesLegend = !isUrdu && products
    ? [...usedCodes]
        .filter((c) => L.code_meanings[c])
        .map((c) => `<strong>${escapeHtml(c)}</strong> = ${L.code_meanings[c]}`)
        .join(' &nbsp;·&nbsp; ')
    : ''

  const registerHtml = products
    ? `
  <table class="register products">
    <thead>
      <tr>
        <th class="p-date">${L.col_date}</th>
        <th class="p-type">${L.col_type}</th>
        ${showRefs ? `<th class="p-inv">${L.col_invoice}</th>` : ''}
        <th class="p-prod">${L.col_product}</th>
        <th class="p-n p-qty">${L.col_qty}</th>
        <th class="p-n p-price">${L.col_price}</th>
        <th class="p-n">${withCur(L.col_debit)}</th>
        <th class="p-n">${withCur(L.col_credit)}</th>
        <th class="p-bal">${withCur(L.col_balance)}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="bf grp">
        <td class="p-date"><span class="ltr">${data.allTime ? '' : formatAppDate(keyToDate(data.periodStart))}</span></td>
        <td colspan="${pCols - 2}">${L.brought_forward}</td>
        <td class="p-bal">${figureBalance(data.openingBalance)}</td>
      </tr>
      ${productBody || `<tr class="empty"><td colspan="${pCols}">${L.no_activity}</td></tr>`}
      <tr class="cf">
        <td class="p-date"><span class="ltr">${formatAppDate(keyToDate(data.periodEnd))}</span></td>
        <td colspan="${pCols - 4}">${L.carried_forward}</td>
        <td class="p-n"><span class="num">${figure(totalDebit)}</span></td>
        <td class="p-n"><span class="num">${figure(totalCredit)}</span></td>
        <td class="p-bal">${figureBalance(closingBalance)}</td>
      </tr>
    </tbody>
  </table>`
    : `
  <table class="register">
    <thead>
      <tr>
        <th class="c-date">${L.col_date}</th>
        <th class="c-details">${L.col_details}</th>
        <th class="c-amt">${L.col_debit}</th>
        <th class="c-amt">${L.col_credit}</th>
        <th class="c-bal">${L.col_balance}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="bf">
        <td class="c-date"><span class="ltr">${data.allTime ? '' : formatAppDate(keyToDate(data.periodStart))}</span></td>
        <td colspan="${colCount - 2}">${L.brought_forward}</td>
        <td class="c-bal">${balanceCell(data.openingBalance)}</td>
      </tr>
      ${bankBody || `<tr class="empty"><td colspan="${colCount}">${L.no_activity}</td></tr>`}
      <tr class="cf">
        <td class="c-date"><span class="ltr">${formatAppDate(keyToDate(data.periodEnd))}</span></td>
        <td colspan="${colCount - 4}">${L.carried_forward}</td>
        <td class="c-amt"><span class="num">${money(totalDebit)}</span></td>
        <td class="c-amt"><span class="num">${money(totalCredit)}</span></td>
        <td class="c-bal">${balanceCell(closingBalance)}</td>
      </tr>
    </tbody>
  </table>`

  const contact = [data.companyPhone, data.companyEmail]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => escapeHtml(v.trim()))
    .join(' &nbsp;·&nbsp; ')

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}" translate="no" class="notranslate">
<head>
  <meta charset="UTF-8">
  <meta name="google" content="notranslate">
  <title>${L.title} — ${escapeHtml(data.accountName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_HREF}" rel="stylesheet">
  <style>
    @page {
      size: ${format.pageCss};
      margin: 12mm 11mm 15mm;
      @bottom-right { content: counter(page) " / " counter(pages); direction: ltr; font-size: 9pt; color: #333; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body {
      font-family: ${FONT_STACK};
      font-size: ${(sheetSize.startsWith('a5') ? 11 : 12) + (isUrdu ? 1 : 0)}px;
      font-weight: 500;
      line-height: 1.5;
      direction: ${dir};
      text-align: ${start};
      padding: 18px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print { body { padding: 0; } .no-print { display: none !important; } }
    .ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
    .num { direction: ltr; unicode-bidi: isolate; display: inline-block; font-variant-numeric: tabular-nums; }

    .masthead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 10px; }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand img { max-height: 54px; max-width: 120px; object-fit: contain; }
    .brand-name { font-size: 1.75em; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
    .brand-sub { color: #222; font-size: 0.92em; margin-top: 2px; }
    .doc { text-align: ${end}; flex-shrink: 0; }
    .doc-title { font-size: 1.35em; font-weight: 700; text-transform: ${isUrdu ? 'none' : 'uppercase'}; letter-spacing: ${isUrdu ? '0' : '0.06em'}; }
    .doc-date { color: #222; font-size: 0.92em; margin-top: 2px; }
    .rule { border-top: 3px solid #000; margin-bottom: 2px; }
    .rule-thin { border-top: 1px solid #000; margin-bottom: 14px; }

    .panels { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-bottom: 12px; }
    .panel { border: 1px solid #000; border-radius: 4px; overflow: hidden; }
    .panel-h { padding: 5px 10px; font-weight: 700; font-size: 0.9em; color: #000; text-transform: ${isUrdu ? 'none' : 'uppercase'}; letter-spacing: ${isUrdu ? '0' : '0.05em'}; border-bottom: 1px solid #000; }
    .panel-b { padding: 8px 10px; }
    .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; }
    .kv .k { color: #333; font-weight: 500; white-space: nowrap; }
    .kv .v { font-weight: 700; color: #000; }
    .holder { font-size: 1.25em; font-weight: 700; margin-bottom: 4px; }

    .summary { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #000; border-radius: 4px; margin-bottom: 14px; }
    .summary > div { padding: 8px 10px; border-${end}: 1px solid #000; }
    .summary > div:last-child { border-${end}: 0; box-shadow: inset 0 0 0 2px #000; }
    .summary .lbl { font-size: 0.9em; font-weight: 600; color: #333; }
    .summary > div:last-child .val { font-size: 1.3em; }
    .summary .val { font-size: 1.2em; font-weight: 700; margin-top: 2px; }
    .summary .cnt { font-size: 0.85em; color: #444; }
    .side { font-size: 0.85em; font-weight: 700; margin-${start}: 5px; }

    table.register { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.register thead { display: table-header-group; }
    table.register th {
      color: #000; font-weight: 700; font-size: 0.92em; border-top: 2px solid #000; border-bottom: 1.5px solid #000;
      padding: 7px 8px; text-align: ${start};
      text-transform: ${isUrdu ? 'none' : 'uppercase'}; letter-spacing: ${isUrdu ? '0' : '0.04em'};
    }
    /* Ruled grid: every cell boxed, like a printed ledger. */
    table.register th, table.register td { border: 1px solid #555; }
    table.register thead th { border: 1px solid #000; border-bottom: 2px solid #000; }
    table.register td { padding: 6px 6px; vertical-align: top; color: #000; }
    table.register tr { break-inside: avoid; page-break-inside: avoid; }
    table.register th.c-amt, table.register th.c-bal, td.c-amt, td.c-bal { text-align: ${end}; white-space: nowrap; }
    .c-date { width: 11.5%; white-space: nowrap; }
    .c-amt { width: 14%; }
    .c-bal { width: 19%; font-weight: 700; }
    td.c-amt, td.c-bal { font-size: 0.95em; }
    .c-details { overflow-wrap: anywhere; }
    .type { font-weight: 700; }
    .desc { color: #222; font-size: 0.92em; margin-top: 1px; }
    /* Product-wise register */
    table.register.products { font-size: 0.88em; }
    table.register.products th { padding: 6px 5px; white-space: nowrap; }
    table.register.products td { padding: 4px 5px; vertical-align: top; }
    .p-date { width: 10%; white-space: nowrap; }
    .p-type { width: 7.5%; font-weight: 700; white-space: nowrap; }
    th .cur { text-transform: none; }
    .p-inv { width: 11%; overflow-wrap: anywhere; }
    .p-prod { overflow-wrap: anywhere; }
    table.register th.p-n, td.p-n { width: 9.5%; text-align: ${end}; white-space: nowrap; }
    table.register th.p-qty, td.p-qty { width: 7%; }
    table.register th.p-price, td.p-price { width: 9.5%; }
    table.register th.p-bal, .p-bal { width: 13%; text-align: ${end}; font-weight: 700; white-space: nowrap; }
    td.p-bal .side { white-space: nowrap; }
    table.register.products tr.grp td { border-top: 1px solid #000; }
    table.register.products tr.sub td { border-top: 1px solid #aaa; }
    tr.adj td.p-prod { font-style: italic; }
    .desc-inline { font-weight: 500; }
    tr.bf td, tr.cf td { font-weight: 700; }
    table.register tr.cf td { border-top: 2px solid #000; border-bottom: 3px double #000; }
    tr.empty td { text-align: center; color: #333; padding: 18px; }

    .legend { margin-top: 8px; color: #222; font-size: 0.9em; font-weight: 600; }
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #000; color: #333; font-size: 0.9em; text-align: center; }

    .no-print { text-align: center; margin: 22px 0 4px; }
    .btn { font-family: inherit; font-size: 13px; padding: 8px 18px; margin: 0 4px; border-radius: 6px; border: 1px solid #14213d; cursor: pointer; }
    .btn-primary { background: #14213d; color: #fff; }
    .btn-secondary { background: #fff; color: #000; }
  </style>
</head>
<body>
  <div class="masthead">
    <div class="brand">
      ${data.companyLogo ? `<img src="${escapeHtml(data.companyLogo)}" alt="">` : ''}
      <div>
        <div class="brand-name">${escapeHtml(businessName)}</div>
        ${data.companyAddress ? `<div class="brand-sub">${escapeHtml(data.companyAddress)}</div>` : ''}
        ${contact ? `<div class="brand-sub">${contact}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">${products ? L.title_products : L.title}</div>
      <div class="doc-date">${L.issued}: <span class="ltr">${formatAppDate(now)} ${now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span></div>
    </div>
  </div>
  <div class="rule"></div><div class="rule-thin"></div>

  <div class="panels">
    <div class="panel">
      <div class="panel-h">${L.account_holder}</div>
      <div class="panel-b">
        <div class="holder">${escapeHtml(accountName)}</div>
        <div class="kv">
          ${data.accountPhone ? `<span class="k">${L.phone}</span><span class="v"><span class="ltr">${escapeHtml(data.accountPhone)}</span></span>` : ''}
          ${data.accountAddress ? `<span class="k">${L.address}</span><span class="v">${escapeHtml(data.accountAddress)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h">${L.period}</div>
      <div class="panel-b kv">
        <span class="k">${L.period}</span><span class="v"><span class="ltr">${periodText}</span></span>
        <span class="k">${L.account_type}</span><span class="v">${data.party === 'customer' ? L.customer_account : L.supplier_account}</span>
        <span class="k">${L.entries_label}</span><span class="v"><span class="ltr">${rows.length}</span></span>
      </div>
    </div>
  </div>

  <div class="summary">
    <div><div class="lbl">${L.opening}</div><div class="val">${balanceCell(data.openingBalance)}</div></div>
    <div><div class="lbl">${L.total_debit}</div><div class="val"><span class="num">${money(totalDebit)}</span></div><div class="cnt"><span class="ltr">${debitCount}</span> ${L.entries}</div></div>
    <div><div class="lbl">${L.total_credit}</div><div class="val"><span class="num">${money(totalCredit)}</span></div><div class="cnt"><span class="ltr">${creditCount}</span> ${L.entries}</div></div>
    <div><div class="lbl">${L.closing}</div><div class="val">${balanceCell(closingBalance)}</div></div>
  </div>

  ${registerHtml}

  <div class="legend">${data.party === 'customer' ? L.customer_note : L.supplier_note}</div>
  ${codesLegend ? `<div class="legend">${codesLegend}</div>` : ''}
  <div class="footer">${L.footer}</div>

  <div class="no-print">
    <button type="button" class="btn btn-primary" onclick="window.print()">${L.print}</button>
    <button type="button" class="btn btn-secondary" onclick="window.close()">${L.close}</button>
  </div>
</body>
</html>`
}
