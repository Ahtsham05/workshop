// Repair prints — 80mm thermal job card / repair invoice, and a small device tag with a
// barcode of the job number. Dual-language (en/ur/ar/hi) like the other receipts.
import type { CurrencyOption } from '@/stores/localization.api'
import { getBusinessTimeZone } from '@/lib/business-timezone'
import { escapeHtml, invoiceNoteToSafeHtml } from '@/lib/escape-html'
import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import {
  isRtlPrintLanguage,
  printDirection,
  printLocale,
  printScriptFontFamilies,
  printScriptFontParams,
} from '@/lib/native-language'
import {
  repairReceiptLabels,
  resolveInvoiceLanguage,
  type InvoiceLanguage,
} from '@/features/invoice/utils/language'

export interface RepairPrintItem {
  name: string
  quantity: number
  unitPrice: number
}

export interface RepairPrintPayment {
  amount: number
  kind: 'advance' | 'payment' | 'refund'
  paymentMethod: string
  walletType?: string
  date?: string
}

export interface RepairReceiptData {
  /** 'job_card' at intake / any time, 'invoice' when the job is handed back. */
  mode?: 'job_card' | 'invoice'
  jobNumber?: string
  customerName: string
  phone?: string
  deviceTypeLabel?: string
  brand?: string
  deviceModel: string
  serialNumber?: string
  color?: string
  accessories?: string
  problems?: string[]
  conditionChecks?: string[]
  issue: string
  /** Technician's work done / findings — shown on the invoice. */
  workDone?: string
  technician?: string
  status: string
  outcome?: string | null
  dueDate?: string | null
  estimatedCharges?: number
  items?: RepairPrintItem[]
  discount?: number
  payments?: RepairPrintPayment[]
  charges: number
  advanceAmount: number
  paymentMethod: string
  warrantyDays?: number
  warrantyUntil?: string | null
  date?: string
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLogo?: string
  isTrial?: boolean
  invoiceNote?: string
  language?: InvoiceLanguage
  isUrduOnly?: boolean
  userPreferredLanguage?: InvoiceLanguage
  /** Organization's configured currency (symbol/decimals) — omit to fall back to PKR. */
  currencyMeta?: CurrencyOption
}

const e = (v: unknown) => escapeHtml(String(v ?? ''))

/** Code 39 only encodes A–Z 0–9 and - . $ / + % space. */
const code39 = (text: string) =>
  `*${text.toUpperCase().replace(/[^A-Z0-9\-. $/+%]/g, '')}*`

export function generateRepairReceiptHTML(data: RepairReceiptData): string {
  const mode = data.mode ?? 'job_card'
  const companyName = data.companyName || 'Repair Center'
  const fmtAmt = (n: number) =>
    formatMoneyWithMeta(n, data.currencyMeta ?? FALLBACK_CURRENCY)

  const language = resolveInvoiceLanguage(data)
  const labels = repairReceiptLabels[language]
  const locale = printLocale(language)
  const dir = printDirection(language)
  const startAlign = isRtlPrintLanguage(language) ? 'right' : 'left'

  const balance = Math.round((data.charges - data.advanceAmount) * 100) / 100
  const statusLabel = (s: string) =>
    s === 'pending'
      ? labels.status_received
      : ((labels as Record<string, string>)[s] ?? s)

  const fmtDate = (d?: string | null, withTime = true) => {
    const dateObj = d ? new Date(d) : new Date()
    const opts = { timeZone: getBusinessTimeZone() } as const
    return withTime
      ? `${dateObj.toLocaleDateString(locale, opts)} ${dateObj.toLocaleTimeString(locale, { ...opts, hour: '2-digit', minute: '2-digit' })}`
      : dateObj.toLocaleDateString(locale, opts)
  }

  const infoRow = (label: string, value: string | undefined | null) =>
    value
      ? `<div class="info-row"><span class="info-label">${label}:</span><span class="info-value">${e(value)}</span></div>`
      : ''

  const items = data.items ?? []
  const payments = data.payments ?? []
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const refunded = payments
    .filter((p) => p.kind === 'refund')
    .reduce((s, p) => s + p.amount, 0)
  const title =
    mode === 'invoice' ? labels.repair_invoice : labels.repair_job_card
  const method = (p: { paymentMethod: string; walletType?: string }) =>
    p.paymentMethod === 'wallet' && p.walletType
      ? p.walletType
      : p.paymentMethod.charAt(0).toUpperCase() + p.paymentMethod.slice(1)

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${e(title)} ${e(data.jobNumber || '')}</title>
  <style>
    @media print {
      @page { margin: 5mm; size: 80mm auto; }
      body { margin: 0; padding: 0; font-size: 13px; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter', 'Manrope', ${printScriptFontFamilies()}, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px; line-height: 1.4; margin: 0; padding: 8px; width: 300px;
      background: white; color: #000; direction: ${dir}; text-align: ${startAlign};
    }
    .receipt-header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .company-logo { max-width: 120px; height: auto; margin: 0 auto 8px; display: block; }
    .business-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
    .business-info { font-size: 10px; margin-bottom: 1px; }
    .doc-title { font-size: 13px; font-weight: bold; margin-top: 6px; border: 1px solid #000; display: inline-block; padding: 2px 10px; }
    .job-no { font-size: 20px; font-weight: 800; letter-spacing: 1px; margin-top: 6px; }
    .barcode { font-family: 'Libre Barcode 39', monospace; font-size: 40px; line-height: 1; margin-top: 2px; }
    .section { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
    .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 5px; }
    .info-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px; font-size: 12px; }
    .info-label { font-weight: bold; white-space: nowrap; }
    .info-value { text-align: end; word-break: break-word; }
    .issue-text { font-size: 12px; padding: 2px 0; word-break: break-word; }
    .chips { font-size: 11px; line-height: 1.5; }
    table.items { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    table.items th { border-bottom: 1px solid #000; text-align: ${startAlign}; padding: 2px 0; }
    table.items td { padding: 2px 0; vertical-align: top; }
    table.items .num { text-align: end; white-space: nowrap; }
    .totals-section { border-top: 2px solid #000; padding-top: 6px; margin-bottom: 10px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 13px; }
    .total-final { font-weight: bold; font-size: 15px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; }
    .warranty-box { border: 1px solid #000; padding: 4px 6px; font-size: 12px; text-align: center; margin-bottom: 10px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 20px; gap: 20px; }
    .sig-box { flex: 1; border-top: 1px solid #000; padding-top: 3px; text-align: center; font-size: 10px; }
    .invoice-branch-note { margin: 10px 0 0; padding: 8px 4px 0; border-top: 1px dashed #666; font-size: 10px; text-align: center; line-height: 1.35; white-space: normal; word-break: break-word; }
    .footer { text-align: center; font-size: 9px; margin-top: 12px; border-top: 2px solid #000; padding-top: 8px; }
    .footer-line { margin-bottom: 2px; }
    .no-print { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn { padding: 8px 16px; margin: 0 5px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    @media screen { body { max-width: 350px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 20px; border-radius: 8px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39${printScriptFontParams()}&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${data.companyLogo ? `<img src="${e(data.companyLogo)}" alt="${e(companyName)}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" />` : ''}
    <div class="business-name">${e(companyName)}</div>
    ${data.companyAddress ? `<div class="business-info">${e(data.companyAddress)}</div>` : ''}
    ${
      data.companyPhone || data.companyEmail
        ? `<div class="business-info">${[data.companyPhone, data.companyEmail]
            .filter(Boolean)
            .map((v) => `<bdi dir="ltr">${e(v)}</bdi>`)
            .join(' | ')}</div>`
        : ''
    }
    <div class="doc-title">${e(title)}</div>
    ${data.jobNumber ? `<div class="job-no"><bdi dir="ltr">${e(data.jobNumber)}</bdi></div><div class="barcode">${e(code39(data.jobNumber))}</div>` : ''}
  </div>

  <div class="section">
    ${infoRow(labels.date, fmtDate(data.date))}
    ${infoRow(labels.status, data.outcome === 'not_repairable' ? `${statusLabel(data.status)} — ${labels.not_repairable}` : statusLabel(data.status))}
    ${mode === 'job_card' && data.dueDate ? infoRow(labels.due_date, fmtDate(data.dueDate, false)) : ''}
    ${infoRow(labels.technician, data.technician)}
  </div>

  <div class="section">
    <div class="section-title">${labels.customer_info}</div>
    ${infoRow(labels.name, data.customerName)}
    ${infoRow(labels.phone, data.phone)}
  </div>

  <div class="section">
    <div class="section-title">${labels.device_info}</div>
    ${infoRow(labels.device_type, data.deviceTypeLabel)}
    ${infoRow(labels.brand, data.brand)}
    ${infoRow(labels.model, data.deviceModel)}
    ${infoRow(labels.color, data.color)}
    ${infoRow(labels.imei_serial, data.serialNumber)}
    ${infoRow(labels.accessories, data.accessories)}
  </div>

  <div class="section">
    <div class="section-title">${labels.fault_issue}</div>
    ${data.problems?.length ? `<div class="chips">${data.problems.map(e).join(' · ')}</div>` : ''}
    <div class="issue-text">${e(data.issue)}</div>
    ${mode === 'invoice' && data.workDone?.trim() ? `<div class="chips" style="margin-top:4px"><strong>${labels.work_done}:</strong> ${e(data.workDone)}</div>` : ''}
    ${mode === 'job_card' && data.conditionChecks?.length ? `<div class="chips"><strong>${labels.condition}:</strong> ${data.conditionChecks.map(e).join(' · ')}</div>` : ''}
  </div>

  ${
    items.length
      ? `<div class="section">
    <div class="section-title">${labels.parts_services}</div>
    <table class="items">
      <thead><tr><th>${labels.item}</th><th class="num">${labels.qty}</th><th class="num">${labels.amount}</th></tr></thead>
      <tbody>
        ${items.map((i) => `<tr><td>${e(i.name)}</td><td class="num">${i.quantity}</td><td class="num">${fmtAmt(i.quantity * i.unitPrice)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`
      : ''
  }

  <div class="totals-section">
    ${items.length && (data.discount ?? 0) > 0 ? `<div class="total-row"><span>${labels.subtotal}:</span><span>${fmtAmt(subtotal)}</span></div><div class="total-row"><span>${labels.discount}:</span><span>- ${fmtAmt(data.discount ?? 0)}</span></div>` : ''}
    <div class="total-row total-final"><span>${items.length ? labels.total_charges : labels.estimate}:</span><span>${fmtAmt(data.charges)}</span></div>
    ${
      payments.length
        ? payments
            .map(
              (p) =>
                `<div class="total-row" style="font-size:12px"><span>${p.kind === 'refund' ? labels.refunded : p.kind === 'advance' ? labels.advance_paid : labels.paid} (${e(method(p))}${p.date ? `, ${fmtDate(p.date, false)}` : ''}):</span><span>${p.kind === 'refund' ? '- ' : ''}${fmtAmt(p.amount)}</span></div>`
            )
            .join('')
        : `<div class="total-row" style="margin-top: 3px;"><span>${labels.advance_paid}:</span><span>${fmtAmt(data.advanceAmount)}</span></div>`
    }
    ${
      balance > 0
        ? `<div class="total-row total-final"><span>${labels.balance_due}:</span><span>${fmtAmt(balance)}</span></div>`
        : balance < 0
          ? `<div class="total-row total-final"><span>${labels.refunded}:</span><span>${fmtAmt(-balance)}</span></div>`
          : `<div class="total-row total-final"><span>✓ ${labels.fully_paid}</span><span></span></div>`
    }
    ${refunded > 0 && payments.length === 0 ? `<div class="total-row"><span>${labels.refunded}:</span><span>${fmtAmt(refunded)}</span></div>` : ''}
  </div>

  ${
    (data.warrantyDays ?? 0) > 0 && data.outcome !== 'not_repairable'
      ? `<div class="warranty-box"><strong>${labels.warranty}:</strong> ${data.warrantyDays} ${labels.days}${data.warrantyUntil ? ` — ${labels.warranty_until} ${fmtDate(data.warrantyUntil, false)}` : ''}</div>`
      : ''
  }

  <div class="signatures">
    <div class="sig-box">${labels.customer_signature}</div>
    <div class="sig-box">${labels.technician_signature}</div>
  </div>

  ${data.invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(data.invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${labels.thank_you}</strong></div>
    ${mode === 'job_card' ? `<div class="footer-line">${labels.keep_receipt}</div>` : ''}
    ${data.companyPhone ? `<div class="footer-line">${labels.contact}: <bdi dir="ltr">${e(data.companyPhone)}</bdi></div>` : ''}
    <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold; text-align: center; line-height: 1.2;">${labels.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${labels.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${labels.print}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${labels.close}</button>
  </div>
</body>
</html>
`.trim()
}

export interface RepairTagData {
  jobNumber: string
  customerName: string
  phone?: string
  device: string
  issue: string
  dueDate?: string | null
  date?: string
  lockHint?: string
}

/**
 * A small tag to stick on / tie to the device (fits a 58mm roll or a 50×30mm label) —
 * job number with barcode so the counter can find the ticket by scanning it.
 */
export function generateRepairTagHTML(data: RepairTagData): string {
  const fmt = (d?: string | null) =>
    d
      ? new Date(d).toLocaleDateString('en-GB', {
          timeZone: getBusinessTimeZone(),
          day: '2-digit',
          month: 'short',
        })
      : ''
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tag ${e(data.jobNumber)}</title>
  <style>
    @media print { @page { margin: 2mm; size: 58mm auto; } .no-print { display: none !important; } body { margin: 0; } }
    body { font-family: 'Inter', system-ui, Arial, sans-serif; width: 200px; margin: 10px auto; color: #000; }
    .tag { border: 1px dashed #000; padding: 6px; }
    .no { font-size: 18px; font-weight: 800; text-align: center; letter-spacing: 1px; }
    .barcode { font-family: 'Libre Barcode 39', monospace; font-size: 34px; text-align: center; line-height: 1; }
    .row { font-size: 11px; display: flex; justify-content: space-between; gap: 6px; }
    .issue { font-size: 11px; margin-top: 3px; border-top: 1px solid #000; padding-top: 3px; word-break: break-word; }
    .no-print { text-align: center; margin-top: 12px; }
    .no-print button { padding: 6px 14px; margin: 0 4px; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&family=Libre+Barcode+39&display=swap" rel="stylesheet">
</head>
<body>
  <div class="tag">
    <div class="no">${e(data.jobNumber)}</div>
    <div class="barcode">${e(code39(data.jobNumber))}</div>
    <div class="row"><strong>${e(data.customerName)}</strong><span>${e(data.phone || '')}</span></div>
    <div class="row"><span>${e(data.device)}</span><span>${data.dueDate ? `Due ${e(fmt(data.dueDate))}` : e(fmt(data.date))}</span></div>
    ${data.lockHint ? `<div class="row"><span>Lock: ${e(data.lockHint)}</span></div>` : ''}
    <div class="issue">${e(data.issue)}</div>
  </div>
  <div class="no-print"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
</body>
</html>`.trim()
}

export function openRepairPrintWindow(
  html: string,
  size: 'receipt' | 'tag' = 'receipt'
): void {
  const win = window.open(
    '',
    '_blank',
    size === 'tag'
      ? 'width=320,height=420'
      : 'width=400,height=700,scrollbars=yes,resizable=yes'
  )
  if (!win) {
    alert('Please allow popups to print. Check your browser settings.')
    return
  }
  win.document.write(html)
  win.document.close()
  let printed = false
  const waitForLoad = () => {
    if (printed) return
    if (win.document.readyState === 'complete') {
      printed = true
      setTimeout(() => {
        try {
          win.print()
        } catch {
          win.close()
        }
      }, 1000)
    } else {
      setTimeout(waitForLoad, 100)
    }
  }
  win.onload = waitForLoad
  setTimeout(waitForLoad, 500)
}
