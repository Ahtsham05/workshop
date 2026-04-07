// Purchase invoice print utilities - Receipt and A4 formats

const formatCurrency = (amount: number): string => {
  return `Rs ${amount.toFixed(2)}`
}

const generateBarcodeText = (text: string): string => {
  return `*${text}*`
}

export function generatePurchaseInvoiceHTML(purchase: any, supplierName: string, t: any): string {
  const items = purchase.items || []
  const totalAmount = purchase.totalAmount || 0
  const paidAmount = purchase.paidAmount || 0
  const balance = purchase.balance ?? (totalAmount - paidAmount)

  const texts = {
    purchase_invoice: 'خریداری انوائس',
    invoice_number: 'انوائس نمبر',
    date: 'تاریخ',
    supplier: 'سپلائر',
    items_purchased: 'خریدی گئی اشیاء',
    product: 'پروڈکٹ',
    price: 'قیمت',
    qty: 'مقدار',
    amount: 'رقم',
    subtotal: 'ذیلی ٹوٹل',
    total: 'کل',
    paid: 'ادا شدہ',
    balance_due: 'باقی رقم',
    paid_in_full: 'مکمل ادائیگی',
    notes: 'نوٹس',
    thank_you: 'آپ کا شکریہ!',
    keep_receipt: 'براہ کرم یہ رسید محفوظ رکھیں',
    visit_again: 'دوبارہ تشریف لائیے گا',
    powered_by: 'Logix Plus Software Solutions',
    print_options: 'پرنٹ آپشنز',
    print_receipt: '🖨️ رسید پرنٹ کریں',
    close: '✕ بند کریں',
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} ${purchase.invoiceNumber || ''}</title>
  <style>
    @media print {
      @page { 
        margin: 5mm; 
        size: 80mm auto; 
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-size: 11px;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.3;
      margin: 0;
      padding: 8px;
      width: 300px;
      background: white;
      color: #000;
      direction: rtl;
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
      text-transform: uppercase;
    }
    
    .business-info {
      font-size: 9px;
      margin-bottom: 1px;
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
      font-size: 11px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .items-section {
      margin-bottom: 12px;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
    }
    
    .items-table th {
      border-bottom: 1px solid #000;
      padding: 3px 2px;
      font-weight: bold;
      font-size: 9px;
      text-align: right;
    }
    
    .items-table td {
      padding: 3px 2px;
      border-bottom: 1px dotted #ccc;
      font-size: 10px;
      text-align: right;
    }
    
    .items-table .col-sr { width: 18px; text-align: center; }
    .items-table .col-product { text-align: right; word-wrap: break-word; overflow-wrap: break-word; }
    .items-table .col-price { width: 50px; white-space: nowrap; }
    .items-table .col-qty { width: 32px; text-align: center; white-space: nowrap; }
    .items-table .col-amount { width: 58px; white-space: nowrap; }
    
    .totals-section {
      border-top: 2px solid #000;
      padding-top: 8px;
      margin-bottom: 12px;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      font-size: 11px;
    }
    
    .total-final {
      font-weight: bold;
      font-size: 13px;
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
    
    .highlight {
      background: #ffffcc;
      padding: 1px 2px;
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    <img src="/images/logo-light.jpeg" alt="Logo" class="company-logo" />
    <div class="business-name">${t('your_store_name')}</div>
    <div class="business-info">${texts.purchase_invoice}</div>
  </div>
  
  <div class="invoice-info">
    <div class="info-row">
      <span class="info-label">${texts.invoice_number}:</span>
      <span class="highlight">${purchase.invoiceNumber || ''}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${texts.supplier}:</span>
      <span>${supplierName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${texts.date}:</span>
      <span>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
    </div>
  </div>
  
  <div class="items-section">
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-sr">#</th>
          <th class="col-product">${texts.product}</th>
          <th class="col-price">${texts.price}</th>
          <th class="col-qty">${texts.qty}</th>
          <th class="col-amount">${texts.amount}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any, index: number) => {
          const price = item.purchasePrice || item.priceAtPurchase || item.unitPrice || 0
          const qty = item.quantity || 0
          const itemTotal = item.total || (price * qty)
          const name = item.product?.name || item.name || ''
          const unit = item.unit || item.product?.unit || 'pcs'
          return `
          <tr>
            <td class="col-sr">${index + 1}</td>
            <td class="col-product">${name}</td>
            <td class="col-price">${formatCurrency(price)}</td>
            <td class="col-qty">${qty} ${unit}</td>
            <td class="col-amount">${formatCurrency(itemTotal)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>
  
  <div class="totals-section">
    <div class="total-row total-final">
      <span>${texts.total}:</span>
      <span>${formatCurrency(totalAmount)}</span>
    </div>
  </div>
  
  <div class="payment-section">
    <div class="total-row" style="margin-bottom: 3px;">
      <span>${texts.paid}:</span>
      <span class="highlight">${formatCurrency(paidAmount)}</span>
    </div>
    ${balance > 0 ? `
    <div class="total-row" style="color: #000; font-weight: bold;">
      <span><strong>${texts.balance_due}:</strong></span>
      <span><strong>${formatCurrency(balance)}</strong></span>
    </div>
    ` : `
    <div class="total-row" style="color: #000; font-weight: bold;">
      <span><strong>${texts.paid_in_full}</strong></span>
      <span>✓</span>
    </div>
    `}
  </div>
  
  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${texts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
    <div class="barcode-text">${purchase.invoiceNumber || ''}</div>
  </div>
  
  ${purchase.notes ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 3px;">${texts.notes}:</div>
      <div>${purchase.notes}</div>
    </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line"><strong>${texts.thank_you}</strong></div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div class="footer-line">${texts.visit_again}</div>
    <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold; text-align: center; line-height: 1.2;">
      ${texts.powered_by}
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${texts.print_options}</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      ${texts.print_receipt}
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ${texts.close}
    </button>
  </div>
</body>
</html>
  `.trim()
}

export function generatePurchaseInvoiceA4HTML(purchase: any, supplierName: string, t: any): string {
  const items = purchase.items || []
  const totalAmount = purchase.totalAmount || 0
  const paidAmount = purchase.paidAmount || 0
  const balance = purchase.balance ?? (totalAmount - paidAmount)

  const texts = {
    purchase_invoice: 'خریداری انوائس',
    invoice_number: 'انوائس نمبر',
    date: 'تاریخ',
    supplier: 'سپلائر',
    supplier_details: 'سپلائر کی تفصیلات',
    product_name: 'پروڈکٹ کا نام',
    quantity: 'مقدار',
    unit_price: 'قیمت',
    total_amount: 'کل رقم',
    subtotal: 'ذیلی ٹوٹل',
    total: 'کل',
    paid: 'ادا شدہ رقم',
    balance_due: 'باقی رقم',
    paid_in_full: 'مکمل ادائیگی',
    payment_information: 'ادائیگی کی معلومات',
    notes: 'نوٹس',
    invoice_barcode: 'انوائس بار کوڈ',
    scan_to_verify: 'تصدیق کے لیے اسکین کریں',
    thank_you: 'آپ کا شکریہ!',
    keep_receipt: 'براہ کرم یہ انوائس محفوظ رکھیں',
    generated_on: 'تیار کیا گیا',
    powered_by: 'Logix Plus Software Solutions',
    print_options: 'پرنٹ آپشنز',
    print_invoice: '🖨️ انوائس پرنٹ کریں',
    close: '✕ بند کریں',
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} - ${purchase.invoiceNumber || ''}</title>
  <style>
    @media print {
      @page { 
        margin: 15mm; 
        size: A4; 
      }
      body { 
        margin: 0; 
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
      padding: 30px;
      background: white;
      color: #000;
      direction: rtl;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 3px solid #000;
    }
    
    .company-info {
      flex: 1;
    }
    
    .company-logo {
      max-width: 80px;
      height: auto;
      margin-bottom: 8px;
    }
    
    .company-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .company-details {
      font-size: 12px;
      color: #555;
    }
    
    .invoice-meta {
      text-align: left;
    }
    
    .invoice-type-label {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .invoice-number {
      font-size: 16px;
      margin-bottom: 4px;
    }
    
    .invoice-date {
      font-size: 13px;
      color: #555;
    }
    
    .supplier-section {
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 6px;
      margin-bottom: 25px;
    }
    
    .section-title {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .supplier-name {
      font-size: 17px;
      font-weight: 600;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    
    .items-table th {
      padding: 10px 12px;
      text-align: right;
      font-weight: 600;
      border-bottom: 2px solid #000;
      font-size: 13px;
    }
    
    .items-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 13px;
      text-align: right;
    }
    
    .items-table th:first-child,
    .items-table td:first-child {
      text-align: center;
      width: 50px;
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 25px;
    }
    
    .totals-table {
      width: 350px;
      border-collapse: collapse;
    }
    
    .totals-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    
    .totals-table .total-row {
      font-weight: bold;
      font-size: 16px;
      border-top: 2px solid #000;
    }
    
    .payment-section {
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 6px;
      margin-bottom: 25px;
    }
    
    .payment-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 14px;
    }
    
    .barcode-section {
      text-align: center;
      margin: 20px 0;
      padding: 15px 0;
      border-top: 1px dashed #ccc;
      border-bottom: 1px dashed #ccc;
    }
    
    .barcode {
      font-family: 'Libre Barcode 39', 'Courier New', monospace;
      font-size: 36px;
      letter-spacing: 2px;
      margin: 8px 0;
      font-weight: normal;
      direction: ltr;
    }
    
    .barcode-text {
      font-size: 10px;
      color: #666;
    }
    
    .notes-section {
      margin: 20px 0;
      padding: 15px;
      border: 1px dashed #ddd;
      border-radius: 4px;
      font-size: 13px;
    }
    
    .footer {
      text-align: center;
      font-size: 11px;
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #000;
      color: #555;
    }
    
    .footer-line {
      margin-bottom: 3px;
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
      padding: 10px 20px;
      margin: 0 5px;
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
    
    @media screen {
      body {
        max-width: 900px;
        margin: 20px auto;
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <img src="/images/logo-light.jpeg" alt="Logo" class="company-logo" />
        <div class="company-name">${t('your_store_name')}</div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-type-label">${texts.purchase_invoice}</div>
        <div class="invoice-number">${purchase.invoiceNumber || ''}</div>
        <div class="invoice-date">
          ${texts.date}: ${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}
        </div>
      </div>
    </div>

    <div class="supplier-section">
      <div class="section-title">${texts.supplier_details}</div>
      <div class="supplier-name">${supplierName}</div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${texts.product_name}</th>
          <th style="text-align: center; width: 100px;">${texts.quantity}</th>
          <th style="text-align: right; width: 120px;">${texts.unit_price}</th>
          <th style="text-align: right; width: 120px;">${texts.total_amount}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any, index: number) => {
          const price = item.purchasePrice || item.priceAtPurchase || item.unitPrice || 0
          const qty = item.quantity || 0
          const itemTotal = item.total || (price * qty)
          const name = item.product?.name || item.name || ''
          const unit = item.unit || item.product?.unit || 'pcs'
          return `
          <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${name}</td>
            <td style="text-align: center;">${qty} ${unit}</td>
            <td style="text-align: right;">${formatCurrency(price)}</td>
            <td style="text-align: right;">${formatCurrency(itemTotal)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <table class="totals-table">
        <tr>
          <td>${texts.subtotal}:</td>
          <td style="text-align: left;">${formatCurrency(totalAmount)}</td>
        </tr>
        <tr class="total-row">
          <td>${texts.total}:</td>
          <td style="text-align: left;">${formatCurrency(totalAmount)}</td>
        </tr>
      </table>
    </div>

    <div class="payment-section">
      <div class="section-title">${texts.payment_information}</div>
      <div class="payment-row">
        <span>${texts.total}:</span>
        <span>${formatCurrency(totalAmount)}</span>
      </div>
      <div class="payment-row">
        <span>${texts.paid}:</span>
        <span>${formatCurrency(paidAmount)}</span>
      </div>
      <div class="payment-row" style="font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px;">
        <span>${balance > 0 ? texts.balance_due : texts.paid_in_full}:</span>
        <span>${balance > 0 ? formatCurrency(balance) : '✓'}</span>
      </div>
    </div>

    <div class="barcode-section">
      <div style="font-size: 12px; margin-bottom: 6px;">${texts.invoice_barcode}</div>
      <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
      <div class="barcode-text">${purchase.invoiceNumber || ''} - ${texts.scan_to_verify}</div>
    </div>

    ${purchase.notes ? `
      <div class="notes-section">
        <div style="font-weight: bold; margin-bottom: 5px;">${texts.notes}:</div>
        <div>${purchase.notes}</div>
      </div>
    ` : ''}

    <div class="footer">
      <div class="footer-line"><strong>${texts.thank_you}</strong></div>
      <div class="footer-line">${texts.keep_receipt}</div>
      <div class="footer-line">${texts.generated_on}: ${new Date().toLocaleString()}</div>
      <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold;">
        ${texts.powered_by}
      </div>
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${texts.print_options}</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      ${texts.print_invoice}
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ${texts.close}
    </button>
  </div>
</body>
</html>
  `.trim()
}
