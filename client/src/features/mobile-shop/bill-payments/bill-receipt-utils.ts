import { invoiceNoteToSafeHtml } from '@/lib/escape-html'
import type { BillPaymentReceipt } from '@/stores/mobile-shop.api'
import { billReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language'

interface BillReceiptOptions {
  orgName?: string
  branchDetails?: {
    name?: string
    address?: string
    phone?: string
    email?: string
    invoiceNote?: string
  }
  userPreferredLanguage?: InvoiceLanguage
  isTrial?: boolean
  logo?: string
}

export function generateBillReceiptHTML(receipt: BillPaymentReceipt, options: BillReceiptOptions = {}): string {
  const language = resolveInvoiceLanguage({ userPreferredLanguage: options.userPreferredLanguage })
  const labels = billReceiptLabels[language]
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'

  const companyName = options.branchDetails?.name || options.orgName || 'Mobile Shop'
  const fmt = (n: number) => `Rs ${n.toLocaleString()}`
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(locale) : '—')
  const fmtTime = (d?: string) => {
    if (!d) return ''
    try { return new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8" />
  <title>${labels.bill_receipt}</title>
  <style>
    @media print {
      @page { 
        margin: 5mm; 
        size: 80mm auto; 
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-size: 13px;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      padding: 8px;
      width: 300px;
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
    
    .business-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .business-info {
      font-size: 10px;
      margin-bottom: 1px;
    }
    
    .receipt-title {
      font-size: 14px;
      font-weight: bold;
      margin: 8px 0;
      text-decoration: underline;
    }
    
    .info-section {
      margin-bottom: 12px;
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 12px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .totals-section {
      border-top: 2px solid #000;
      padding-top: 8px;
      margin-bottom: 12px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 13px;
    }
    
    .total-final {
      font-weight: bold;
      font-size: 16px;
      border-top: 1px solid #000;
      padding-top: 3px;
      margin-top: 3px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #000;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
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
    
    @media screen {
      body {
        max-width: 350px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        padding: 20px;
        border-radius: 8px;
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${options.logo ? `<img src="${options.logo}" alt="${companyName}" class="company-logo" style="max-width:120px;height:auto;margin:0 auto 8px;display:block;" />` : options.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" style="max-width:120px;height:auto;margin:0 auto 8px;display:block;" />` : ''}
    <div class="business-name">${companyName}</div>
    ${options.branchDetails?.address ? `<div class="business-info">${options.branchDetails.address}</div>` : ''}
    ${options.branchDetails?.phone || options.branchDetails?.email ? `
      <div class="business-info">
        ${options.branchDetails.phone || ''}
        ${options.branchDetails.phone && options.branchDetails.email ? ' | ' : ''}
        ${options.branchDetails.email || ''}
      </div>
    ` : ''}
    <div class="receipt-title">${labels.bill_receipt}</div>
  </div>
  
  <div class="info-section">
    <div class="info-row">
      <span class="info-label">${labels.customer}:</span>
      <span>${receipt.customerName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.company}:</span>
      <span>${receipt.companyName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.bill_type}:</span>
      <span>${receipt.billType.charAt(0).toUpperCase() + receipt.billType.slice(1)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.reference_no}:</span>
      <span>${receipt.referenceNumber}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.payment_date}:</span>
      <span>${fmtDate(receipt.paymentDate)} ${fmtTime(receipt.paymentDate)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${labels.due_date}:</span>
      <span>${fmtDate(receipt.dueDate)}</span>
    </div>
  </div>
  
  <div class="totals-section">
    <div class="total-row">
      <span>${labels.bill_amount}:</span>
      <span>${fmt(receipt.billAmount)}</span>
    </div>
    <div class="total-row">
      <span>${labels.service_charge}:</span>
      <span>${fmt(receipt.serviceCharge)}</span>
    </div>
    <div class="total-row total-final">
      <span>${labels.total_paid}:</span>
      <span>${fmt(receipt.totalPaid)}</span>
    </div>
    <div class="total-row" style="margin-top: 6px;">
      <span>${labels.payment_method}:</span>
      <span>${receipt.paymentMethod.toUpperCase()}</span>
    </div>
    <div class="total-row">
      <span>${labels.status}:</span>
      <span class="status-badge">${receipt.status.toUpperCase()}</span>
    </div>
  </div>

  ${receipt.previousOutstanding ? `
  <div class="totals-section" style="border-top: 1px dashed #000;">
    <div class="total-row" style="font-weight: bold; text-decoration: underline;">
      <span>${labels.previous_outstanding} (${receipt.previousOutstanding.referenceNumber})</span>
    </div>
    <div class="total-row">
      <span>${labels.already_collected}:</span>
      <span>${fmt(receipt.previousOutstanding.totalReceived)}</span>
    </div>
    <div class="total-row">
      <span>${labels.overdue_since}:</span>
      <span>${fmtDate(receipt.previousOutstanding.dueDate)}</span>
    </div>
    <div class="total-row total-final">
      <span>${labels.amount_to_settle}:</span>
      <span>${fmt(receipt.previousOutstanding.expectedLateAmount ?? receipt.previousOutstanding.billAmount)}</span>
    </div>
  </div>
  ` : ''}

  ${options.branchDetails?.invoiceNote?.trim()
    ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(options.branchDetails.invoiceNote)}</div>`
    : ''}
  
  <div class="footer">
    <div class="footer-line"><strong>${labels.thank_you}</strong></div>
    <div class="footer-line" style="margin-top: 4px; font-weight: bold;">${labels.powered_by}</div>
  </div>
  
  <div class="no-print">
    <button onclick="window.print()" class="print-btn print-btn-primary">🖨️ ${labels.print}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">✕ ${labels.close}</button>
  </div>
</body>
</html>`
}

export function openBillReceiptPrintWindow(receipt: BillPaymentReceipt, options?: BillReceiptOptions) {
  const html = generateBillReceiptHTML(receipt, options)
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 300)
}
