// Repair job receipt print utility — 80mm thermal printer format with dual-language support
import { invoiceNoteToSafeHtml } from '@/lib/escape-html'
import { repairReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language'

export interface RepairReceiptData {
  customerName: string
  phone?: string
  deviceModel: string
  serialNumber?: string
  color?: string
  accessories?: string
  issue: string
  technician?: string
  status: string
  charges: number
  advanceAmount: number
  paymentMethod: string
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
}

const fmtAmt = (n: number) => `Rs${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function generateRepairReceiptHTML(data: RepairReceiptData): string {
  const {
    customerName, phone, deviceModel, serialNumber, color, accessories,
    issue, technician, status, charges, advanceAmount, paymentMethod, date,
    companyName = 'Mobile Shop', companyAddress, companyPhone, companyEmail,
  } = data

  const language = resolveInvoiceLanguage(data)
  const labels = repairReceiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'

  const balance = charges - advanceAmount

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending: labels.pending,
      in_progress: labels.in_progress,
      completed: labels.completed,
      delivered: labels.delivered,
    }
    return map[s] ?? s
  }

  const fmtDate = (d?: string) => {
    const dateObj = d ? new Date(d) : new Date()
    return `${dateObj.toLocaleDateString(locale)} ${dateObj.toLocaleTimeString(locale)}`
  }

  const infoRow = (label: string, value: string | undefined) =>
    value ? `<div class="info-row"><span class="info-label">${label}:</span><span>${value}</span></div>` : ''

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.repair_job_card}</title>
  <style>
    @media print {
      @page { margin: 5mm; size: 80mm auto; }
      body { margin: 0; padding: 0; font-size: 13px; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px; line-height: 1.4; margin: 0; padding: 8px; width: 300px;
      background: white; color: #000; direction: ${dir}; text-align: ${startAlign};
    }
    .receipt-header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .company-logo { max-width: 120px; height: auto; margin: 0 auto 8px; display: block; }
    .business-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
    .business-info { font-size: 10px; margin-bottom: 1px; }
    .section { margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 5px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; }
    .info-label { font-weight: bold; }
    .issue-text { font-size: 12px; padding: 4px 0; word-break: break-word; }
    .totals-section { border-top: 2px solid #000; padding-top: 8px; margin-bottom: 12px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 13px; }
    .total-final { font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 20px; gap: 20px; }
    .sig-box { flex: 1; border-top: 1px solid #000; padding-top: 3px; text-align: center; font-size: 10px; }
    .invoice-branch-note { margin: 10px 0 0; padding: 8px 4px 0; border-top: 1px dashed #666; font-size: 10px; text-align: center; line-height: 1.35; white-space: normal; word-break: break-word; }
    .footer { text-align: center; font-size: 9px; margin-top: 12px; border-top: 2px solid #000; padding-top: 8px; }
    .footer-line { margin-bottom: 2px; }
    .no-print { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn { padding: 8px 16px; margin: 0 5px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    .highlight { background: #ffffcc; padding: 1px 2px; }
    @media screen { body { max-width: 350px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 20px; border-radius: 8px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${companyName}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" />` : ''}
    <div class="business-name">${companyName}</div>
    ${companyAddress ? `<div class="business-info">${companyAddress}</div>` : ''}
    ${companyPhone || companyEmail ? `<div class="business-info">${[companyPhone, companyEmail].filter(Boolean).join(' | ')}</div>` : ''}
    <div style="font-size: 13px; font-weight: bold; margin-top: 6px; border: 1px solid #000; display: inline-block; padding: 2px 10px;">${labels.repair_job_card}</div>
  </div>

  <div class="section">
    ${infoRow(labels.date, fmtDate(date))}
    ${infoRow(labels.status, statusLabel(status))}
    ${infoRow(labels.payment_method, paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1))}
  </div>

  <div class="section">
    <div class="section-title">${labels.customer_info}</div>
    ${infoRow(labels.name, customerName)}
    ${infoRow(labels.phone, phone)}
  </div>

  <div class="section">
    <div class="section-title">${labels.device_info}</div>
    ${infoRow(labels.model, deviceModel)}
    ${infoRow(labels.color, color)}
    ${infoRow(labels.imei_serial, serialNumber)}
    ${infoRow(labels.technician, technician)}
    ${accessories ? infoRow(labels.accessories, accessories) : ''}
  </div>

  <div class="section">
    <div class="section-title">${labels.fault_issue}</div>
    <div class="issue-text">${issue}</div>
  </div>

  <div class="totals-section">
    <div class="total-row total-final"><span>${labels.total_charges}:</span><span>${fmtAmt(charges)}</span></div>
    <div class="total-row" style="margin-top: 3px;"><span>${labels.advance_paid}:</span><span class="highlight">${fmtAmt(advanceAmount)}</span></div>
    ${balance > 0
      ? `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>${labels.balance_due}:</strong></span><span><strong>${fmtAmt(balance)}</strong></span></div>`
      : `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>✓ ${labels.fully_paid}</strong></span><span></span></div>`
    }
  </div>

  <div class="signatures">
    <div class="sig-box">${labels.customer_signature}</div>
    <div class="sig-box">${labels.technician_signature}</div>
  </div>

  ${data.invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(data.invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${labels.thank_you}</strong></div>
    <div class="footer-line">${labels.keep_receipt}</div>
    ${companyPhone ? `<div class="footer-line">${labels.contact}: ${companyPhone}</div>` : ''}
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

export function openRepairPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes')
  if (!win) {
    alert('Please allow popups to print. Check your browser settings.')
    return
  }
  win.document.write(html)
  win.document.close()
  const waitForLoad = () => {
    if (win.document.readyState === 'complete') {
      setTimeout(() => { try { win.print() } catch (e) { console.error('Print error:', e); win.close() } }, 1000)
    } else { setTimeout(waitForLoad, 100) }
  }
  win.onload = waitForLoad
  setTimeout(waitForLoad, 500)
}
