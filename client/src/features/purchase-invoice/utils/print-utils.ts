import { invoiceNoteToSafeHtml } from '@/lib/escape-html'
import { purchaseReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language'

export interface PrintInvoiceData {
  invoiceNumber: string
  items: Array<{
    name: string
    quantity: number
    unit?: string
    unitPrice: number
    subtotal: number
  }>
  customerId?: string | { name: string; id: string; _id?: string }
  customerName?: string
  walkInCustomerName?: string
  type: 'cash' | 'credit' | 'pending'
  subtotal: number
  tax: number
  discount: number
  total: number
  paidAmount: number
  balance: number
  dueDate?: string
  notes?: string
  invoiceNote?: string
  deliveryCharge?: number
  serviceCharge?: number
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxNumber?: string
  companyLogo?: string
  isTrial?: boolean
  language?: InvoiceLanguage
  isUrduOnly?: boolean
  userPreferredLanguage?: InvoiceLanguage
}

const generateBarcodeText = (text: string): string => `*${text}*`

const formatCurrency = (amount: number): string => `Rs${amount.toFixed(2)}`

export const generateInvoiceHTML = (data: PrintInvoiceData): string => {
  const {
    invoiceNumber, items, customerId, customerName, walkInCustomerName,
    type, subtotal, tax, discount, total, paidAmount, balance,
    dueDate, notes, invoiceNote, deliveryCharge = 0, serviceCharge = 0,
    companyName, companyAddress, companyPhone, companyEmail, companyTaxNumber
  } = data

  const language = resolveInvoiceLanguage(data)
  const labels = purchaseReceiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'

  const texts = {
    ...labels,
    business_name: companyName || labels.not_available,
    business_address: companyAddress || '',
    business_phone: companyPhone || '',
    business_email: companyEmail || '',
    tax_id: companyTaxNumber ? `Tax ID: ${companyTaxNumber}` : '',
  }

  const getTypeText = (t: string) => {
    switch(t) { case 'cash': return texts.cash; case 'credit': return texts.credit; case 'pending': return texts.pending; default: return t }
  }

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} ${invoiceNumber}</title>
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
    .invoice-info { margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; }
    .info-label { font-weight: bold; }
    .items-section { margin-bottom: 12px; }
    .items-header { border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; font-weight: bold; font-size: 12px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 4px; table-layout: fixed; }
    .items-table th { border-bottom: 1px dashed #000; padding: 3px 2px; text-align: ${startAlign}; font-weight: bold; font-size: 11px; white-space: nowrap; }
    .items-table th:first-child { width: 18px; text-align: center; }
    .items-table th:nth-child(3) { width: 50px; text-align: center; }
    .items-table th:nth-child(4) { width: 32px; text-align: center; }
    .items-table th:last-child { width: 58px; text-align: ${language === 'ur' ? 'left' : 'right'}; }
    .items-table td { padding: 3px 2px; vertical-align: top; border-bottom: 1px dotted #ddd; font-size: 11px; word-wrap: break-word; overflow-wrap: break-word; }
    .items-table td:first-child { text-align: center; }
    .items-table td:nth-child(3), .items-table td:nth-child(4) { text-align: center; white-space: nowrap; }
    .items-table td:last-child { text-align: ${language === 'ur' ? 'left' : 'right'}; font-weight: bold; white-space: nowrap; }
    .items-table .total-row-table td { border-top: 1px dashed #000; border-bottom: none; font-weight: bold; padding-top: 4px; }
    .totals-section { border-top: 2px solid #000; padding-top: 8px; margin-bottom: 12px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 13px; }
    .total-final { font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; }
    .payment-section { margin-bottom: 12px; border-top: 1px dashed #000; padding-top: 8px; }
    .barcode-section { text-align: center; margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 20px; letter-spacing: 1px; margin: 6px 0; font-weight: normal; direction: ltr; }
    .barcode-text { font-size: 8px; margin-top: 2px; }
    .notes-section { margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; font-size: 9px; }
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
    ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${texts.business_name}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus solutions" class="company-logo" />` : ''}
    <div class="business-name">${texts.business_name}</div>
    ${texts.business_address ? `<div class="business-info">${texts.business_address}</div>` : ''}
    ${texts.business_phone || texts.business_email ? `<div class="business-info">${[texts.business_phone, texts.business_email].filter(Boolean).join(' | ')}</div>` : ''}
    ${texts.tax_id ? `<div class="business-info">${texts.tax_id}</div>` : ''}
    <div style="font-size: 13px; font-weight: bold; margin-top: 6px; border: 1px solid #000; display: inline-block; padding: 2px 10px;">${texts.purchase_invoice}</div>
  </div>

  <div class="invoice-info">
    <div class="info-row"><span class="info-label">${texts.invoice_number}:</span><span class="highlight">${invoiceNumber}</span></div>
    <div class="info-row"><span class="info-label">${texts.date}:</span><span>${new Date().toLocaleDateString(locale)} ${new Date().toLocaleTimeString(locale)}</span></div>
    <div class="info-row"><span class="info-label">${texts.payment_type}:</span><span>${getTypeText(type)}</span></div>
    <div class="info-row"><span class="info-label">${texts.supplier}:</span><span>${customerId === 'walk-in' ? (walkInCustomerName || texts.not_available) : (customerName || texts.not_available)}</span></div>
    ${type === 'credit' && dueDate ? `<div class="info-row"><span class="info-label">${texts.balance_due}:</span><span>${new Date(dueDate).toLocaleDateString(locale)}</span></div>` : ''}
  </div>

  <div class="items-section">
    <div class="items-header">${texts.items_purchased}</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>S.r.</th>
          <th>${texts.item}</th>
          <th>${texts.price}</th>
          <th>${texts.qty}</th>
          <th>${texts.total}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.name}</td>
          <td>${item.unitPrice.toFixed(2)}</td>
          <td>${item.quantity}</td>
          <td>${item.subtotal.toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr class="total-row-table">
          <td colspan="2">${texts.total}:</td>
          <td></td>
          <td>${items.reduce((sum, item) => sum + item.quantity, 0)}</td>
          <td>${subtotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="totals-section">
    <div class="total-row"><span>${texts.subtotal}:</span><span>${formatCurrency(subtotal)}</span></div>
    ${discount > 0 ? `<div class="total-row"><span>Discount:</span><span>-${formatCurrency(discount)}</span></div>` : ''}
    ${deliveryCharge > 0 ? `<div class="total-row"><span>Delivery:</span><span>${formatCurrency(deliveryCharge)}</span></div>` : ''}
    ${serviceCharge > 0 ? `<div class="total-row"><span>Service:</span><span>${formatCurrency(serviceCharge)}</span></div>` : ''}
    ${tax > 0 ? `<div class="total-row"><span>Tax:</span><span>${formatCurrency(tax)}</span></div>` : ''}
    <div class="total-row total-final"><span>${texts.total}:</span><span>${formatCurrency(total)}</span></div>
  </div>

  ${type !== 'pending' ? `
    <div class="payment-section">
      <div class="total-row" style="margin-bottom: 3px;"><span>${texts.paid}:</span><span class="highlight">${formatCurrency(paidAmount)}</span></div>
      ${balance > 0 ? `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>${texts.balance_due}:</strong></span><span><strong>${formatCurrency(balance)}</strong></span></div>` : ''}
      ${balance === 0 ? `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>${texts.paid_in_full}</strong></span><span>✓</span></div>` : ''}
    </div>
  ` : ''}

  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${texts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${invoiceNumber}</div>
  </div>

  ${notes ? `<div class="notes-section"><div style="font-weight: bold; margin-bottom: 3px;">${texts.notes}:</div><div>${notes}</div></div>` : ''}

  ${invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${texts.thank_you}</strong></div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold; text-align: center; line-height: 1.2;">${texts.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${texts.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${texts.print_receipt}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${texts.close}</button>
  </div>
</body>
</html>
  `.trim()
}

export const generateA4InvoiceHTML = (data: PrintInvoiceData): string => {
  const {
    invoiceNumber, items, customerId, customerName, walkInCustomerName,
    type, subtotal, tax, discount, total, paidAmount, balance,
    notes, deliveryCharge = 0, serviceCharge = 0,
    companyName, companyAddress, companyPhone, companyEmail, companyTaxNumber
  } = data

  const language = resolveInvoiceLanguage(data)
  const labels = purchaseReceiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'
  const endAlign = language === 'ur' ? 'left' : 'right'

  const texts = {
    ...labels,
    business_name: companyName || labels.not_available,
    business_address: companyAddress || '',
    business_phone: companyPhone || '',
    business_email: companyEmail || '',
    tax_id: companyTaxNumber ? `Tax ID: ${companyTaxNumber}` : '',
  }

  const getTypeText = (t: string) => {
    switch(t) { case 'cash': return texts.cash; case 'credit': return texts.credit; case 'pending': return texts.pending; default: return t }
  }

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} ${invoiceNumber}</title>
  <style>
    :root {
      --inv-ink: #171717;
      --inv-muted: #737373;
      --inv-border: #e5e7eb;
      --inv-surface: #fafafa;
      --inv-th: #f4f4f5;
    }
    @media print {
      @page { margin: 14mm; size: A4; }
      body { margin: 0; padding: 0; font-size: 11pt; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      margin: 0;
      padding: 24px;
      background: #fff;
      color: var(--inv-ink);
      direction: ${dir};
      text-align: ${startAlign};
      -webkit-font-smoothing: antialiased;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--inv-border);
    }
    .company-info { flex: 1; min-width: 0; }
    .company-logo { max-width: 140px; height: auto; margin-bottom: 12px; display: block; }
    .company-name {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--inv-ink);
      margin: 0 0 8px 0;
      line-height: 1.2;
    }
    .company-details { font-size: 10pt; color: var(--inv-muted); line-height: 1.45; }
    .invoice-details { text-align: ${endAlign}; flex: 0 0 auto; }
    .invoice-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--inv-muted);
      margin: 0 0 12px 0;
    }
    .invoice-meta { font-size: 10.5pt; color: var(--inv-ink); line-height: 1.55; }
    .invoice-meta strong { font-weight: 600; font-variant-numeric: tabular-nums; }
    .bill-value { font-weight: 600; color: var(--inv-ink); }
    .invoice-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 32px;
      margin-bottom: 28px;
      padding: 18px 20px;
      background: var(--inv-surface);
      border: 1px solid var(--inv-border);
      border-radius: 6px;
    }
    .info-section { display: flex; flex-direction: column; gap: 10px; }
    .info-title {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--inv-muted);
      margin: 0 0 4px 0;
    }
    .info-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 10px;
      font-size: 10.5pt;
      line-height: 1.45;
    }
    .info-row .status-badge { margin-inline-start: auto; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1px solid var(--inv-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .items-table thead { background: var(--inv-th); }
    .items-table th {
      padding: 10px 12px;
      text-align: ${startAlign};
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #525252;
      border: none;
      border-bottom: 1px solid var(--inv-border);
    }
    .items-table th:last-child { text-align: ${endAlign}; }
    .items-table td {
      padding: 11px 12px;
      border: none;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
      font-size: 10.5pt;
      color: var(--inv-ink);
    }
    .items-table tbody tr:last-child td { border-bottom: none; }
    .cell-num { font-variant-numeric: tabular-nums; color: var(--inv-muted); font-weight: 500; }
    .cell-strong { font-weight: 600; color: var(--inv-ink); }
    .items-table .text-right { text-align: ${endAlign}; }
    .items-table .text-center { text-align: center; }
    .items-table .text-left { text-align: ${startAlign}; }
    .totals-outer { width: 100%; margin: 20px 0 24px; }
    .totals-inner { margin-inline-start: auto; width: 100%; max-width: 300px; }
    .totals-table { width: 100%; border-collapse: collapse; border: none; }
    .totals-table td {
      padding: 8px 0;
      font-size: 10.5pt;
      border: none;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: baseline;
    }
    .totals-table tr:last-child td { border-bottom: none; }
    .totals-table .total-label {
      font-weight: 500;
      text-align: ${endAlign};
      color: var(--inv-muted);
      padding-inline-end: 16px;
      width: 52%;
    }
    .totals-table .total-amount {
      text-align: ${endAlign};
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--inv-ink);
    }
    .totals-table .final-total td {
      padding-top: 12px;
      margin-top: 4px;
      border-top: 1px solid var(--inv-border);
      border-bottom: none;
      font-size: 12pt;
      font-weight: 600;
    }
    .totals-table .final-total .total-label { color: var(--inv-ink); font-weight: 600; }
    .barcode-section {
      text-align: center;
      margin: 28px 0;
      padding: 18px 20px;
      background: var(--inv-surface);
      border: 1px solid var(--inv-border);
      border-radius: 6px;
    }
    .barcode-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--inv-muted);
      margin-bottom: 10px;
    }
    .barcode {
      font-family: 'Libre Barcode 39', 'Courier New', monospace;
      font-size: 28px;
      letter-spacing: 2px;
      margin: 8px 0;
      direction: ltr;
      color: var(--inv-ink);
    }
    .barcode-text { font-size: 10px; color: var(--inv-muted); margin-top: 8px; }
    .notes-section {
      margin: 24px 0;
      padding: 14px 16px;
      background: var(--inv-surface);
      border-inline-start: 3px solid #d4d4d4;
      border-radius: 0 6px 6px 0;
      font-size: 10.5pt;
    }
    .notes-heading {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--inv-muted);
      margin-bottom: 8px;
    }
    .invoice-branch-note {
      margin: 20px 0 0;
      padding: 14px 16px;
      background: var(--inv-surface);
      border: 1px solid var(--inv-border);
      border-radius: 6px;
      font-size: 10.5pt;
      text-align: center;
      line-height: 1.5;
      word-break: break-word;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      color: var(--inv-muted);
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid var(--inv-border);
    }
    .footer-line { margin-bottom: 6px; }
    .footer-thanks { font-size: 11px; font-weight: 600; color: var(--inv-ink); margin-bottom: 8px; }
    .footer-brand { margin-top: 12px; font-weight: 600; color: var(--inv-ink); font-size: 10px; }
    .no-print {
      text-align: center;
      margin: 28px 0 0;
      padding: 18px;
      background: #f4f4f5;
      border: 1px solid var(--inv-border);
      border-radius: 8px;
    }
    .print-options-title {
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
      color: var(--inv-ink);
    }
    .print-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 8px; }
    .print-btn {
      padding: 10px 20px;
      font-size: 13px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
    }
    .print-btn-primary { background: #262626; color: #fff; }
    .print-btn-secondary { background: #fff; color: var(--inv-ink); border: 1px solid var(--inv-border); }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border: 1px solid #d4d4d4;
      background: #fff;
      color: #525252;
    }
    .status-cash, .status-credit, .status-pending {
      background: #fff;
      color: #404040;
      border-color: #d4d4d4;
    }
    @media screen {
      body {
        max-width: 720px;
        margin: 24px auto;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        padding: 40px 44px;
        border-radius: 8px;
        border: 1px solid var(--inv-border);
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${texts.business_name}" class="company-logo" />` : data.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus solutions" class="company-logo" />` : ''}
      <div class="company-name">${texts.business_name}</div>
      <div class="company-details">
        ${texts.business_address ? `${texts.business_address}<br>` : ''}
        ${texts.business_phone ? `${texts.business_phone}<br>` : ''}
        ${texts.business_email ? `${texts.business_email}<br>` : ''}
        ${texts.tax_id || ''}
      </div>
    </div>
    <div class="invoice-details">
      <div class="invoice-title">${texts.purchase_invoice}</div>
      <div class="invoice-meta">
        <div><strong>#${invoiceNumber}</strong></div>
        <div>${texts.date}: ${new Date().toLocaleDateString(locale)}</div>
        <div>${texts.time}: ${new Date().toLocaleTimeString(locale)}</div>
      </div>
    </div>
  </div>

  <div class="invoice-info">
    <div class="info-section">
      <div class="info-title">${texts.supplier}:</div>
      <div class="info-row">
        <span class="bill-value">${customerId === 'walk-in' ? (walkInCustomerName || texts.not_available) : (customerName || texts.not_available)}</span>
        <span class="status-badge status-${type}">${getTypeText(type)}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-title">${texts.invoice_number}:</div>
      <div class="info-row"><span>${new Date().toLocaleDateString(locale)}</span></div>
    </div>
  </div>

  <table class="items-table">
    <thead><tr>
      <th style="width: 5%;">#</th>
      <th style="width: 40%;">${texts.item}</th>
      <th style="width: 12%;" class="text-center">${texts.qty}</th>
      <th style="width: 15%;" class="text-right">${texts.price}</th>
      <th style="width: 18%;" class="text-right">${texts.total}</th>
    </tr></thead>
    <tbody>
      ${items.map((item, index) => `
        <tr>
          <td class="text-center cell-num">${index + 1}</td>
          <td class="text-left cell-strong">${item.name}</td>
          <td class="text-center cell-num">${item.quantity} ${item.unit || 'pcs'}</td>
          <td class="text-right cell-num">${formatCurrency(item.unitPrice)}</td>
          <td class="text-right cell-strong">${formatCurrency(item.subtotal)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals-outer">
    <div class="totals-inner">
      <table class="totals-table">
      ${subtotal > 0 ? `<tr><td class="total-label">${texts.subtotal}:</td><td class="total-amount">${formatCurrency(subtotal)}</td></tr>` : ''}
      ${discount > 0 ? `<tr><td class="total-label">Discount:</td><td class="total-amount">-${formatCurrency(discount)}</td></tr>` : ''}
      ${deliveryCharge > 0 ? `<tr><td class="total-label">Delivery:</td><td class="total-amount">${formatCurrency(deliveryCharge)}</td></tr>` : ''}
      ${serviceCharge > 0 ? `<tr><td class="total-label">Service:</td><td class="total-amount">${formatCurrency(serviceCharge)}</td></tr>` : ''}
      ${tax > 0 ? `<tr><td class="total-label">Tax:</td><td class="total-amount">${formatCurrency(tax)}</td></tr>` : ''}
      <tr class="final-total"><td class="total-label">${texts.total}:</td><td class="total-amount">${formatCurrency(total)}</td></tr>
      </table>
    </div>
  </div>

  ${type !== 'pending' ? `
  <div class="totals-outer">
    <div class="totals-inner">
      <table class="totals-table">
      <tr><td class="total-label">${texts.paid}:</td><td class="total-amount">${formatCurrency(paidAmount)}</td></tr>
      <tr class="final-total"><td class="total-label">${texts.balance_due}:</td><td class="total-amount">${formatCurrency(Math.max(balance, 0))}</td></tr>
      </table>
    </div>
  </div>
  ` : ''}

  ${notes ? `<div class="notes-section"><div class="notes-heading">${texts.notes}:</div><div>${notes}</div></div>` : ''}

  <div class="footer">
    <div class="footer-line footer-thanks">${texts.thank_you}</div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div class="footer-brand">${texts.powered_by}</div>
  </div>

  <div class="no-print">
    <div class="print-options-title">${texts.print_options}</div>
    <div class="print-actions">
      <button onclick="window.print()" type="button" class="print-btn print-btn-primary">${texts.print_receipt}</button>
      <button onclick="window.close()" type="button" class="print-btn print-btn-secondary">${texts.close}</button>
    </div>
  </div>
</body>
</html>
  `.trim()
}

export const openPrintWindow = (htmlContent: string): void => {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(blobUrl, '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes')
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl)
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
  printWindow.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true })
}

export const openA4PrintWindow = (htmlContent: string): void => {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(blobUrl, '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes')
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl)
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
  printWindow.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true })
}
