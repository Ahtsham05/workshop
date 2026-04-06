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
    dueDate, notes, deliveryCharge = 0, serviceCharge = 0,
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
    .item-row { margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px dotted #ccc; }
    .item-name { font-weight: bold; font-size: 13px; margin-bottom: 1px; }
    .item-details { font-size: 12px; color: #555; display: flex; justify-content: space-between; }
    .totals-section { border-top: 2px solid #000; padding-top: 8px; margin-bottom: 12px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 13px; }
    .total-final { font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; }
    .payment-section { margin-bottom: 12px; border-top: 1px dashed #000; padding-top: 8px; }
    .barcode-section { text-align: center; margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 20px; letter-spacing: 1px; margin: 6px 0; font-weight: normal; direction: ltr; }
    .barcode-text { font-size: 8px; margin-top: 2px; }
    .notes-section { margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; font-size: 9px; }
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
    ${items.map((item, index) => `
      <div class="item-row">
        <div class="item-name">${index + 1}. ${item.name}</div>
        <div class="item-details">
          <span>${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(item.unitPrice)}</span>
          <span><strong>${formatCurrency(item.subtotal)}</strong></span>
        </div>
      </div>
    `).join('')}
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
      ${balance > 0 ? `<div class="total-row" style="color: #d32f2f; font-weight: bold;"><span><strong>${texts.balance_due}:</strong></span><span><strong>${formatCurrency(balance)}</strong></span></div>` : ''}
      ${balance === 0 ? `<div class="total-row" style="color: #2e7d32; font-weight: bold;"><span><strong>${texts.paid_in_full}</strong></span><span>✓</span></div>` : ''}
    </div>
  ` : ''}

  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${texts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${invoiceNumber}</div>
  </div>

  ${notes ? `<div class="notes-section"><div style="font-weight: bold; margin-bottom: 3px;">${texts.notes}:</div><div>${notes}</div></div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${texts.thank_you}</strong></div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div style="margin-top: 8px; font-size: 8px; color: #666; text-align: center; line-height: 1.2;">${texts.powered_by}</div>
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
    @media print { @page { margin: 1in; size: A4; } body { margin: 0; padding: 0; font-size: 12px; } .no-print { display: none !important; } }
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px; line-height: 1.4; margin: 0; padding: 20px; background: white; color: #000; direction: ${dir}; text-align: ${startAlign};
    }
    .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid black; padding-bottom: 20px; }
    .company-info { flex: 1; }
    .company-logo { max-width: 150px; height: auto; margin-bottom: 10px; display: block; }
    .company-name { font-size: 28px; font-weight: bold; color: #007bff; margin-bottom: 5px; }
    .company-details { font-size: 12px; color: #666; line-height: 1.3; }
    .invoice-details { text-align: ${endAlign}; flex: 1; }
    .invoice-title { font-size: 24px; font-weight: bold; color: #333; margin-bottom: 10px; }
    .invoice-meta { font-size: 12px; color: #666; }
    .invoice-info { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
    .info-section { display: flex; flex-direction: column; gap: 8px; }
    .info-title { font-weight: bold; font-size: 16px; color: #333; margin-bottom: 5px; }
    .info-row { display: flex; justify-content: space-between; font-size: 13px; }
    .info-label { font-weight: 600; color: #555; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 2px solid black; }
    .items-table th { padding: 12px 8px; text-align: ${startAlign}; font-weight: 800; font-size: 14px; border: 1px solid #0056b3; border-bottom: 2px solid #0056b3; }
    .items-table td { padding: 12px 8px; border: 1px solid #dee2e6; vertical-align: top; font-size: 13px; }
    .items-table tr:nth-child(even) { background: #f8f9fa; }
    .items-table tr:hover { background: #e3f2fd; }
    .items-table tbody tr:last-child td { border-bottom: 2px solid black; }
    .items-table .text-right { text-align: ${endAlign}; }
    .items-table .text-center { text-align: center; }
    .items-table .text-left { text-align: ${startAlign}; }
    .totals-table { width: 400px; border-collapse: collapse; border: 2px solid black; border-radius: 8px; overflow: hidden; }
    .totals-table td { padding: 10px 12px; border-bottom: 1px solid #e9ecef; font-size: 13px; }
    .totals-table .total-label { font-weight: 700; text-align: ${endAlign}; background: #f8f9fa; border-right: 1px solid #dee2e6; }
    .totals-table .total-amount { text-align: ${startAlign}; font-weight: 600; background: white; }
    .totals-table .final-total { background: white; color: black; font-weight: bold; font-size: 16px; border-bottom: none; }
    .totals-table .final-total .total-label, .totals-table .final-total .total-amount { background: white; color: black; border-right: none; }
    .barcode-section { text-align: center; margin: 30px 0; padding: 20px; border: 2px dashed #ccc; border-radius: 8px; }
    .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 32px; letter-spacing: 2px; margin: 10px 0; font-weight: normal; direction: ltr; }
    .barcode-text { font-size: 12px; color: #666; margin-top: 5px; }
    .notes-section { margin: 30px 0; padding: 15px; background: #f8f9fa; border-right: 4px solid black; border-radius: 8px 0 0 8px; }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 40px; padding-top: 20px; border-top: 2px solid #e9ecef; }
    .footer-line { margin-bottom: 5px; }
    .no-print { text-align: center; margin: 30px 0; padding: 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; }
    .print-btn { padding: 10px 20px; margin: 0 10px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .status-cash { background: #d4edda; color: #155724; }
    .status-credit { background: #cce5ff; color: #004085; }
    .status-pending { background: #fff3cd; color: #856404; }
    @media screen { body { max-width: 800px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 40px; border-radius: 12px; } }
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
        <span><strong>${customerId === 'walk-in' ? (walkInCustomerName || texts.not_available) : (customerName || texts.not_available)}</strong></span>
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
          <td class="text-center"><strong>${index + 1}</strong></td>
          <td class="text-left"><strong>${item.name}</strong></td>
          <td class="text-center"><strong>${item.quantity} ${item.unit || 'pcs'}</strong></td>
          <td class="text-right"><strong>${formatCurrency(item.unitPrice)}</strong></td>
          <td class="text-right"><strong>${formatCurrency(item.subtotal)}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="padding-top: 20px; margin-bottom: 20px;">
    <table class="totals-table">
      ${subtotal > 0 ? `<tr><td class="total-label">${texts.subtotal}:</td><td class="total-amount">${formatCurrency(subtotal)}</td></tr>` : ''}
      ${discount > 0 ? `<tr><td class="total-label">Discount:</td><td class="total-amount">-${formatCurrency(discount)}</td></tr>` : ''}
      ${deliveryCharge > 0 ? `<tr><td class="total-label">Delivery:</td><td class="total-amount">${formatCurrency(deliveryCharge)}</td></tr>` : ''}
      ${serviceCharge > 0 ? `<tr><td class="total-label">Service:</td><td class="total-amount">${formatCurrency(serviceCharge)}</td></tr>` : ''}
      ${tax > 0 ? `<tr><td class="total-label">Tax:</td><td class="total-amount">${formatCurrency(tax)}</td></tr>` : ''}
      <tr class="final-total"><td class="total-label">${texts.total}:</td><td class="total-amount" style="font-size: 16px; font-weight: bold;">${formatCurrency(total)}</td></tr>
    </table>
  </div>

  ${type !== 'pending' ? `
  <div style="padding-top: 20px; margin-bottom: 20px;">
    <table class="totals-table">
      <tr style="background: #e8f5e9;"><td class="total-label" style="background: #e8f5e9;">${texts.paid}:</td><td class="total-amount" style="background: #e8f5e9; font-size: 14px; font-weight: bold;">${formatCurrency(paidAmount)}</td></tr>
      <tr style="background: ${balance > 0 ? '#ffebee' : '#e8f5e9'};"><td class="total-label" style="background: ${balance > 0 ? '#ffebee' : '#e8f5e9'}; color: ${balance > 0 ? '#d32f2f' : '#2e7d32'}; font-weight: bold;">${texts.balance_due}:</td><td class="total-amount" style="background: ${balance > 0 ? '#ffebee' : '#e8f5e9'}; color: ${balance > 0 ? '#d32f2f' : '#2e7d32'}; font-size: 14px; font-weight: bold;">${formatCurrency(Math.max(balance, 0))}</td></tr>
    </table>
  </div>
  ` : ''}

  <div class="barcode-section">
    <div style="font-size: 14px; margin-bottom: 8px; font-weight: bold;">${texts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${invoiceNumber}</div>
  </div>

  ${notes ? `<div class="notes-section"><div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">${texts.notes}:</div><div style="font-size: 14px;">${notes}</div></div>` : ''}

  <div class="footer">
    <div class="footer-line" style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">${texts.thank_you}</div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div style="margin-top: 15px; font-size: 11px; color: #777; text-align: center; line-height: 1.3;">${texts.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">${texts.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${texts.print_receipt}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${texts.close}</button>
  </div>
</body>
</html>
  `.trim()
}

export const openPrintWindow = (htmlContent: string): void => {
  const printWindow = window.open('', '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes')
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    const waitForLoad = () => {
      if (printWindow.document.readyState === 'complete') {
        setTimeout(() => { try { printWindow.print() } catch (e) { console.error('Print error:', e); printWindow.close() } }, 1000)
      } else { setTimeout(waitForLoad, 100) }
    }
    printWindow.onload = waitForLoad
    setTimeout(waitForLoad, 500)
  } else { throw new Error('Unable to open print window. Please check your popup blocker.') }
}

export const openA4PrintWindow = (htmlContent: string): void => {
  const printWindow = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes')
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    const waitForLoad = () => {
      if (printWindow.document.readyState === 'complete') {
        setTimeout(() => { try { printWindow.print() } catch (e) { console.error('A4 Print error:', e); printWindow.close() } }, 1500)
      } else { setTimeout(waitForLoad, 100) }
    }
    printWindow.onload = waitForLoad
    setTimeout(waitForLoad, 500)
  } else { throw new Error('Unable to open print window. Please check your popup blocker.') }
}
