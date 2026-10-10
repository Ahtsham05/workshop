import { escapeHtml } from '@/lib/escape-html'
import { formatAppDate } from '@/lib/date-format'
import { PAPER_FORMATS, type SheetSize } from '@/features/invoice/utils/paper-format'

export type ReceiptLanguage = 'en' | 'ur'
export type ReceiptParty = 'customer' | 'supplier'
/** 'full' = a whole A4/A5 page; 'half' = one half of a landscape A4 sheet. */
export type ReceiptFit = 'full' | 'half'

export interface ReceiptPrintData {
  party: ReceiptParty
  language: ReceiptLanguage
  receiptNumber: string
  partyName: string
  partyPhone?: string
  partyAddress?: string
  amount: number
  /** ISO date-time of the payment. */
  date: string
  paymentMethod?: string
  reference?: string
  description?: string
  previousBalance: number
  currentBalance: number
  company: { name: string; address?: string; phone?: string; email?: string; logo?: string }
  isTrial?: boolean
  /** Formats an absolute amount with the business currency. */
  formatMoney: (amount: number) => string
}

const labels = {
  en: {
    title_customer: 'Payment Receipt',
    title_supplier: 'Payment Voucher',
    copy: 'Customer Copy',
    copy_supplier: 'Supplier Copy',
    receipt_no: 'Receipt No.',
    voucher_no: 'Voucher No.',
    date: 'Date',
    time: 'Time',
    amount_received: 'Amount Received',
    amount_paid: 'Amount Paid',
    in_words: 'Amount in words',
    received_from: 'Received From',
    paid_to: 'Paid To',
    phone: 'Phone',
    address: 'Address',
    method: 'Payment Mode',
    reference: 'Reference',
    narration: 'Narration',
    account: 'Account Position',
    previous: 'Previous Balance',
    this_payment_in: 'Less: This Payment',
    this_payment_out: 'Less: This Payment',
    remaining: 'Balance After Payment',
    receivable: 'Receivable',
    payable: 'Payable',
    settled: 'Settled',
    stamp_in: 'Received',
    stamp_out: 'Paid',
    sign_cashier: 'Cashier / Authorised Signature',
    sign_customer: 'Customer Signature',
    sign_supplier: 'Supplier Signature',
    footer: 'Computer-generated receipt. Please keep it for your records.',
    thanks: 'Thank you for your payment.',
    print: 'Print',
    close: 'Close',
    only: 'Only',
  },
  ur: {
    title_customer: 'رسیدِ وصولی',
    title_supplier: 'ادائیگی واؤچر',
    copy: 'کسٹمر کاپی',
    copy_supplier: 'سپلائر کاپی',
    receipt_no: 'رسید نمبر',
    voucher_no: 'واؤچر نمبر',
    date: 'تاریخ',
    time: 'وقت',
    amount_received: 'وصول شدہ رقم',
    amount_paid: 'ادا شدہ رقم',
    in_words: 'رقم الفاظ میں',
    received_from: 'منجانب',
    paid_to: 'بنام',
    phone: 'فون',
    address: 'پتہ',
    method: 'طریقۂ ادائیگی',
    reference: 'حوالہ',
    narration: 'تفصیل',
    account: 'کھاتے کی صورتحال',
    previous: 'سابقہ بیلنس',
    this_payment_in: 'منہا: موجودہ وصولی',
    this_payment_out: 'منہا: موجودہ ادائیگی',
    remaining: 'بقایا بیلنس',
    receivable: 'بنام',
    payable: 'جمع',
    settled: 'بیباق',
    stamp_in: 'وصول شد',
    stamp_out: 'ادا شد',
    sign_cashier: 'کیشیئر / مجاز دستخط',
    sign_customer: 'کسٹمر کے دستخط',
    sign_supplier: 'سپلائر کے دستخط',
    footer: 'یہ کمپیوٹر سے تیار کردہ رسید ہے، براہِ کرم اپنے ریکارڈ کے لیے محفوظ رکھیں۔',
    thanks: 'ادائیگی کا شکریہ۔',
    print: 'پرنٹ کریں',
    close: 'بند کریں',
    only: '',
  },
}

const METHOD_LABELS: Record<string, { en: string; ur: string }> = {
  cash: { en: 'Cash', ur: 'نقد' },
  bank: { en: 'Bank Transfer', ur: 'بینک ٹرانسفر' },
  bank_transfer: { en: 'Bank Transfer', ur: 'بینک ٹرانسفر' },
  cheque: { en: 'Cheque', ur: 'چیک' },
  check: { en: 'Cheque', ur: 'چیک' },
  card: { en: 'Card', ur: 'کارڈ' },
  online: { en: 'Online', ur: 'آن لائن' },
  wallet: { en: 'Mobile Wallet', ur: 'موبائل والیٹ' },
}

const FONT_STACK = `'Inter', 'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap'

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowThousand(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`)
    n %= 100
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''))
  } else if (n > 0) {
    parts.push(ONES[n])
  }
  return parts.join(' ')
}

/** Whole-number amount in English words, e.g. 4250 → "Four Thousand Two Hundred Fifty". */
export function amountToWords(amount: number): string {
  let n = Math.floor(Math.abs(Number(amount) || 0))
  if (n === 0) return 'Zero'
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion']
  const parts: string[] = []
  for (let i = 0; n > 0 && i < scales.length; i++) {
    const chunk = n % 1000
    if (chunk) parts.unshift(`${belowThousand(chunk)}${scales[i] ? ` ${scales[i]}` : ''}`)
    n = Math.floor(n / 1000)
  }
  return parts.join(' ')
}

/**
 * Bank-style payment receipt (customer) / payment voucher (supplier) for A4, A5, or one half
 * of a landscape A4 sheet: letterhead, receipt number + date strip, boxed amount with amount
 * in words, particulars table, account position (previous → this payment → balance), stamp
 * and signature lines. All sizes are in `em`, so one layout scales to every sheet.
 */
export function generatePaymentReceiptBodyHTML(data: ReceiptPrintData, fit: ReceiptFit, sheetSize: SheetSize = 'a4'): string {
  const L = labels[data.language]
  const isUrdu = data.language === 'ur'
  const isSupplier = data.party === 'supplier'
  const money = (n: number) => `<span class="num">${data.formatMoney(Math.abs(n))}</span>`

  const owedByUs = isSupplier ? data.currentBalance > 0 : data.currentBalance < 0
  const settled = Math.abs(data.currentBalance) < 0.005
  const statusLabel = settled ? L.settled : owedByUs ? L.payable : L.receivable

  const methodKey = (data.paymentMethod || '').trim().toLowerCase().replace(/\s+/g, '_')
  const method = METHOD_LABELS[methodKey]?.[data.language] || data.paymentMethod?.trim() || ''
  const paymentDate = new Date(data.date)
  const dateText = Number.isNaN(paymentDate.getTime()) ? data.date : formatAppDate(paymentDate)
  const timeText = Number.isNaN(paymentDate.getTime())
    ? ''
    : paymentDate.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })

  const cents = Math.round((Math.abs(data.amount) % 1) * 100)
  const words = isUrdu
    ? ''
    : `${amountToWords(data.amount)}${cents ? ` and ${String(cents).padStart(2, '0')}/100` : ''} ${L.only}`.trim()
  const contact = [data.company.phone, data.company.email]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => escapeHtml(v.trim()))
    .join(' &nbsp;·&nbsp; ')

  const particular = (label: string, value?: string, ltr = false) =>
    value?.trim()
      ? `<tr><th>${label}</th><td>${ltr ? `<span class="ltr">${escapeHtml(value.trim())}</span>` : escapeHtml(value.trim())}</td></tr>`
      : ''

  const fontPx = (fit === 'half' ? 12 : sheetSize.startsWith('a5') ? 12.5 : 14) + (isUrdu ? 1 : 0)

  return `
  <div class="rcpt rcpt-${fit}" style="font-size:${fontPx}px">
    <div class="r-head">
      <div class="r-brand">
        ${data.company.logo ? `<img src="${escapeHtml(data.company.logo)}" alt="">` : data.isTrial ? `<img src="/images/logo-light.png" alt="">` : ''}
        <div class="r-brand-text">
          <div class="r-company">${escapeHtml(data.company.name)}</div>
          ${data.company.address ? `<div class="r-sub">${escapeHtml(data.company.address)}</div>` : ''}
          ${contact ? `<div class="r-sub">${contact}</div>` : ''}
        </div>
      </div>
      <div class="r-doc">
        <div class="r-title">${isSupplier ? L.title_supplier : L.title_customer}</div>
        <div class="r-copy">${isSupplier ? L.copy_supplier : L.copy}</div>
      </div>
    </div>
    <div class="r-rule"></div>

    <div class="r-strip">
      <div><span class="k">${isSupplier ? L.voucher_no : L.receipt_no}</span><span class="v ltr">${escapeHtml(data.receiptNumber)}</span></div>
      <div><span class="k">${L.date}</span><span class="v ltr">${dateText}</span></div>
      ${timeText ? `<div><span class="k">${L.time}</span><span class="v ltr">${timeText}</span></div>` : ''}
    </div>

    <div class="r-amount">
      <div class="r-amount-main">
        <div class="k">${isSupplier ? L.amount_paid : L.amount_received}</div>
        <div class="r-amount-value">${money(data.amount)}</div>
        ${words ? `<div class="r-words"><span class="k">${L.in_words}:</span> ${escapeHtml(words)}</div>` : ''}
      </div>
      <div class="r-stamp">${isSupplier ? L.stamp_out : L.stamp_in}</div>
    </div>

    <table class="r-table">
      <tbody>
        <tr><th>${isSupplier ? L.paid_to : L.received_from}</th><td class="strong">${escapeHtml(data.partyName)}</td></tr>
        ${particular(L.phone, data.partyPhone, true)}
        ${particular(L.address, data.partyAddress)}
        ${particular(L.method, method)}
        ${particular(L.reference, data.reference, true)}
        ${particular(L.narration, data.description)}
      </tbody>
    </table>

    <div class="r-section">${L.account}</div>
    <table class="r-ledger">
      <tbody>
        <tr><td>${L.previous}</td><td class="amt">${money(data.previousBalance)}</td></tr>
        <tr><td>${isSupplier ? L.this_payment_out : L.this_payment_in}</td><td class="amt">${money(data.amount)}</td></tr>
        <tr class="total"><td>${L.remaining}</td><td class="amt">${money(data.currentBalance)} <span class="status">${statusLabel}</span></td></tr>
      </tbody>
    </table>

    <div class="r-signs">
      <div>${L.sign_cashier}</div>
      <div>${isSupplier ? L.sign_supplier : L.sign_customer}</div>
    </div>

    <div class="r-foot">${isSupplier ? '' : `<strong>${L.thanks}</strong> `}${L.footer}</div>
  </div>`
}

/** CSS shared by the full-page and half-sheet receipt documents. */
function receiptCss(dir: 'rtl' | 'ltr'): string {
  const start = dir === 'rtl' ? 'right' : 'left'
  const end = dir === 'rtl' ? 'left' : 'right'
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: ${FONT_STACK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { .no-print { display: none !important; } }
    .ltr, .num { direction: ltr; unicode-bidi: isolate; display: inline-block; }
    .num { font-variant-numeric: tabular-nums; }

    .rcpt { font-weight: 500; line-height: 1.45; text-align: ${start}; border: 1px solid #000; padding: 1.4em 1.5em 1.1em; break-inside: avoid; }
    .rcpt-full { max-width: 175mm; margin: 0 auto; }
    .r-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1em; }
    .r-brand { display: flex; align-items: center; gap: 0.8em; min-width: 0; flex: 1; }
    .r-brand img { max-height: 4.2em; max-width: 8em; object-fit: contain; }
    .r-brand-text { min-width: 0; }
    .r-company { font-size: 1.45em; font-weight: 800; line-height: 1.2; color: #000; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .r-sub { color: #222; font-size: 0.9em; margin-top: 0.15em; }
    .r-doc { text-align: ${end}; flex-shrink: 0; }
    .r-title { font-size: 1.15em; font-weight: 800; color: #000; text-transform: ${dir === 'rtl' ? 'none' : 'uppercase'}; letter-spacing: ${dir === 'rtl' ? '0' : '0.06em'}; white-space: nowrap; }
    .r-copy { display: inline-block; margin-top: 0.35em; font-size: 0.82em; font-weight: 700; color: #222; border: 1px solid #666; border-radius: 3px; padding: 0.05em 0.6em; }
    .r-rule { border-top: 3px solid #000; border-bottom: 1px solid #000; height: 4px; margin: 0.8em 0 1em; }

    .r-strip { display: flex; flex-wrap: wrap; gap: 0.4em 1.6em; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 0.45em 0.8em; margin-bottom: 0.9em; }
    .r-strip .k { color: #333; font-weight: 600; margin-${end}: 0.4em; }
    .r-strip .k::after { content: ':'; }
    .r-strip .v { font-weight: 700; }

    .r-amount { display: flex; align-items: center; justify-content: space-between; gap: 1em; border: 1.5px solid #000; padding: 0.7em 1em; margin-bottom: 0.9em; }
    .r-amount .k { color: #222; font-size: 0.92em; font-weight: 700; }
    .r-amount-value { font-size: 2em; font-weight: 800; color: #000; line-height: 1.15; }
    .r-words { font-size: 0.92em; margin-top: 0.25em; font-style: italic; color: #000; }
    .r-words .k { font-style: normal; }
    .r-stamp { flex-shrink: 0; border: 2px solid #000; color: #000; border-radius: 6px; padding: 0.3em 0.8em; font-weight: 800;
      font-size: 1.05em; text-transform: ${dir === 'rtl' ? 'none' : 'uppercase'}; letter-spacing: ${dir === 'rtl' ? '0' : '0.1em'}; transform: rotate(-8deg); }

    .r-table, .r-ledger { width: 100%; border-collapse: collapse; }
    .r-table th, .r-table td { border: 1px solid #777; padding: 0.4em 0.7em; vertical-align: top; text-align: ${start}; }
    .r-table th { width: 32%; color: #000; font-weight: 700; white-space: nowrap; }
    .r-table td { overflow-wrap: anywhere; }
    .r-table td.strong { font-weight: 700; font-size: 1.08em; }

    .r-section { margin: 0.9em 0 0.35em; font-weight: 700; color: #000; font-size: 0.92em; text-transform: ${dir === 'rtl' ? 'none' : 'uppercase'}; letter-spacing: ${dir === 'rtl' ? '0' : '0.05em'}; }
    .r-ledger td { padding: 0.35em 0.7em; border-bottom: 1px solid #cfd4db; color: #000; }
    .r-ledger td.amt { text-align: ${end}; white-space: nowrap; font-weight: 600; }
    .r-ledger tr.total td { border-top: 1.5px solid #000; border-bottom: 3px double #000; font-weight: 800; font-size: 1.05em; }
    .r-ledger .status { font-size: 0.82em; font-weight: 700; border: 1px solid #333; border-radius: 3px; padding: 0 0.4em; margin-${start}: 0.3em; vertical-align: middle; }

    .r-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5em; margin-top: 3em; }
    .r-signs div { border-top: 1px solid #000; padding-top: 0.35em; text-align: center; font-size: 0.92em; font-weight: 600; color: #000; }
    .r-foot { margin-top: 1.1em; padding-top: 0.5em; border-top: 1px dashed #c9ced6; text-align: center; font-size: 0.85em; color: #333; }

    .no-print { text-align: center; margin: 22px 0 4px; }
    .btn { font-family: inherit; font-size: 13px; padding: 8px 18px; margin: 0 4px; border-radius: 6px; border: 1px solid #000; cursor: pointer; }
    .btn-primary { background: #000; color: #fff; }
    .btn-secondary { background: #fff; color: #000; }
  `
}

function documentHead(data: ReceiptPrintData, pageCss: string, pageMargin: string, extraCss = ''): string {
  const L = labels[data.language]
  const dir = data.language === 'ur' ? 'rtl' : 'ltr'
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${data.language}" translate="no" class="notranslate">
<head>
  <meta charset="UTF-8">
  <meta name="google" content="notranslate">
  <title>${data.party === 'supplier' ? L.title_supplier : L.title_customer} ${escapeHtml(data.receiptNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_HREF}" rel="stylesheet">
  <style>
    @page { size: ${pageCss}; margin: ${pageMargin}; }
    ${receiptCss(dir)}
    ${extraCss}
  </style>
</head>`
}

const printButtons = (data: ReceiptPrintData) => {
  const L = labels[data.language]
  return `
  <div class="no-print">
    <button type="button" class="btn btn-primary" onclick="window.print()">${L.print}</button>
    <button type="button" class="btn btn-secondary" onclick="window.close()">${L.close}</button>
  </div>`
}

/** Receipt on its own A4 or A5 page (portrait or landscape, per the sheet size). */
export function generatePaymentReceiptPageHTML(data: ReceiptPrintData, sheetSize: SheetSize): string {
  const format = PAPER_FORMATS[sheetSize]
  return `${documentHead(data, format.pageCss, '12mm', '@media screen { body { padding: 24px; } }')}
<body>
  ${generatePaymentReceiptBodyHTML(data, 'full', sheetSize)}
  ${printButtons(data)}
</body>
</html>`
}

/**
 * Receipt printed into the left or right half of a landscape A4 sheet, the other half left
 * blank — print one receipt, feed the same sheet back, print the next one on the other half.
 * Halves are physical positions, so the split is laid out LTR even for an Urdu receipt.
 */
export function generatePaymentReceiptHalfSheetHTML(data: ReceiptPrintData, half: 'left' | 'right'): string {
  const dir = data.language === 'ur' ? 'rtl' : 'ltr'
  const body = generatePaymentReceiptBodyHTML(data, 'half')
  const extraCss = `
    .sheet { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
    .sheet > .half { padding: 0 6mm; min-width: 0; }
    .sheet > .half + .half { border-left: 1px dashed #bbb; }
    @media screen { body { padding: 16px; } .sheet { max-width: 1100px; margin: 0 auto; } }
  `
  return `${documentHead(data, 'A4 landscape', '8mm', extraCss)}
<body>
  <div class="sheet" dir="ltr">
    <div class="half" dir="${dir}">${half === 'left' ? body : ''}</div>
    <div class="half" dir="${dir}">${half === 'right' ? body : ''}</div>
  </div>
  ${printButtons(data)}
</body>
</html>`
}
