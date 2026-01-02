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
  previousBalance?: number
  newBalance?: number
  netBalance?: number
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxNumber?: string
}

export const generateBarcodeText = (text: string): string => {
  // Generate Code 39 barcode format - requires * start/stop characters
  return `*${text}*`
}

export const formatCurrency = (amount: number): string => {
  return `Rs${amount.toFixed(2)}`
}

export const generateInvoiceHTML = (data: PrintInvoiceData): string => {
  const {
    invoiceNumber,
    items,
    customerId,
    customerName,
    walkInCustomerName,
    type,
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    balance,
    dueDate,
    notes,
    deliveryCharge = 0,
    serviceCharge = 0,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyTaxNumber
  } = data
  console.log("data",data)

  // Urdu translations
  const urduTexts = {
    business_name: companyName || 'آپ کا کاروبار',
    business_address: companyAddress || 'آپ کا پتہ، شہر، ملک',
    business_phone: companyPhone || '+92 300 1234567',
    business_email: companyEmail || 'info@yourbusiness.com',
    tax_id: companyTaxNumber ? `ٹیکس آئی ڈی: ${companyTaxNumber}` : 'ٹیکس آئی ڈی: 123456789',
    invoice_title: 'رسید',
    invoice_number: 'رسید نمبر',
    date: 'تاریخ',
    time: 'وقت',
    type: 'قسم',
    customer: 'کسٹمر',
    due_date: 'آخری تاریخ',
    walk_in_customer: 'واک ان کسٹمر',
    items_purchased: 'خریدی گئی اشیاء',
    subtotal: 'ذیلی ٹوٹل',
    discount: 'رعایت',
    delivery_charge: 'ڈیلیوری چارج',
    service_charge: 'سروس چارج',
    tax: 'ٹیکس',
    total: 'کل',
    paid: 'ادا شدہ',
    balance_due: 'باقی رقم',
    paid_in_full: 'مکمل ادائیگی',
    previous_balance: 'پچھلا بیلنس',
    current_invoice: 'موجودہ انوائس',
    net_balance: 'کل بیلنس',
    notes: 'نوٹس',
    thank_you: 'آپ کا شکریہ!',
    keep_receipt: 'براہ کرم یہ رسید محفوظ رکھیں',
    visit_again: 'دوبارہ تشریف لائیے گا',
    powered_by: 'Logix Plus Software Solutions',
    print_options: 'پرنٹ آپشنز',
    print_receipt: '🖨️ رسید پرنٹ کریں',
    close: '✕ بند کریں',
    cash: 'cash',
    credit: 'credit',
    pending: 'pending'
  }

  const getTypeText = (type: string) => {
    switch(type) {
      case 'cash': return urduTexts.cash
      case 'credit': return urduTexts.credit
      case 'pending': return urduTexts.pending
      default: return type
    }
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${urduTexts.invoice_title} ${invoiceNumber}</title>
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
    
    .items-header {
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
      margin-bottom: 5px;
      font-weight: bold;
      font-size: 10px;
    }
    
    .item-row {
      margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 1px dotted #ccc;
    }
    
    .item-name {
      font-weight: bold;
      font-size: 11px;
      margin-bottom: 1px;
    }
    
    .item-details {
      font-size: 9px;
      color: #555;
      display: flex;
      justify-content: space-between;
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
    <img src="/images/logo-light.png" alt="Jhulelal" class="company-logo" />
    <div class="business-name">${urduTexts.business_name}</div>
    <div class="business-info">${urduTexts.business_address}</div>
    <div class="business-info">${urduTexts.business_phone} | ${urduTexts.business_email}</div>
    <div class="business-info">${urduTexts.tax_id}</div>
  </div>
  
  <div class="invoice-info">
    <div class="info-row">
      <span class="info-label">${urduTexts.invoice_number}:</span>
      <span class="highlight">${invoiceNumber}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${urduTexts.date}:</span>
      <span>${new Date().toLocaleDateString('ur-PK')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${urduTexts.type}:</span>
      <span>${getTypeText(type)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${urduTexts.customer}:</span>
      <span>${customerId === 'walk-in' ? (walkInCustomerName || urduTexts.walk_in_customer) : (customerName || 'N/A')}</span>
    </div>
    ${type === 'credit' && dueDate ? `
    <div class="info-row">
      <span class="info-label">${urduTexts.due_date}:</span>
      <span>${new Date(dueDate).toLocaleDateString('ur-PK')}</span>
    </div>
    ` : ''}
  </div>
  
  <div class="items-section">
    <div class="items-header">${urduTexts.items_purchased}</div>
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
    <div class="total-row">
      <span>${urduTexts.subtotal}:</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>
    ${discount > 0 ? `
    <div class="total-row">
      <span>${urduTexts.discount}:</span>
      <span>-${formatCurrency(discount)}</span>
    </div>
    ` : ''}
    ${deliveryCharge > 0 ? `
    <div class="total-row">
      <span>${urduTexts.delivery_charge}:</span>
      <span>${formatCurrency(deliveryCharge)}</span>
    </div>
    ` : ''}
    ${serviceCharge > 0 ? `
    <div class="total-row">
      <span>${urduTexts.service_charge}:</span>
      <span>${formatCurrency(serviceCharge)}</span>
    </div>
    ` : ''}
    ${tax > 0 ? `
    <div class="total-row">
      <span>${urduTexts.tax}:</span>
      <span>${formatCurrency(tax)}</span>
    </div>
    ` : ''}
    <div class="total-row total-final">
      <span>${urduTexts.total}:</span>
      <span>${formatCurrency(total)}</span>
    </div>
  </div>
  
  ${(data.previousBalance !== undefined && data.previousBalance !== null && customerId !== 'walk-in') ? `
    <div class="payment-section" style="border-top: 1px solid #000; margin-top: 8px;">
      <div class="total-row" style="font-size: 10px; color: #666; margin-bottom: 3px;">
        <span>${urduTexts.previous_balance}:</span>
        <span style="color: ${data.previousBalance > 0 ? '#d32f2f' : data.previousBalance < 0 ? '#2e7d32' : '#666'}">
          ${formatCurrency(Math.abs(data.previousBalance || 0))} ${data.previousBalance > 0 ? '(Dr)' : data.previousBalance < 0 ? '(Cr)' : ''}
        </span>
      </div>
      <div class="total-row" style="font-size: 10px; color: #666; margin-bottom: 3px;">
        <span>${urduTexts.current_invoice}:</span>
        <span style="color: #d32f2f;">${formatCurrency(total)} (Dr)</span>
      </div>
      <div class="total-row" style="font-weight: bold; border-top: 1px dotted #000; padding-top: 3px;">
        <span>${urduTexts.net_balance}:</span>
        <span style="color: ${(data.previousBalance || 0) + total > 0 ? '#d32f2f' : '#2e7d32'}">
          ${formatCurrency(Math.abs((data.previousBalance || 0) + total))} ${(data.previousBalance || 0) + total > 0 ? '(Receivable)' : '(Payable)'}
        </span>
      </div>
    </div>
  ` : ''}
  
  ${type !== 'pending' ? `
    <div class="payment-section">
      <div class="total-row">
        <span>${urduTexts.paid}:</span>
        <span class="highlight">${formatCurrency(paidAmount)}</span>
      </div>
      ${balance > 0 ? `
      <div class="total-row" style="color: #d32f2f;">
        <span><strong>${urduTexts.balance_due}:</strong></span>
        <span><strong>${formatCurrency(balance)}</strong></span>
      </div>
      ` : ''}
      ${balance === 0 ? `
      <div class="total-row" style="color: #2e7d32;">
        <span><strong>${urduTexts.paid_in_full}</strong></span>
        <span>✓</span>
      </div>
      ` : ''}
    </div>
  ` : ''}
  
  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${urduTexts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${invoiceNumber}</div>
  </div>
  
  ${notes ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 3px;">${urduTexts.notes}:</div>
      <div>${notes}</div>
    </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line"><strong>${urduTexts.thank_you}</strong></div>
    <div class="footer-line">${urduTexts.keep_receipt}</div>
    <div class="footer-line">${urduTexts.visit_again}</div>
    <div style="margin-top: 8px; font-size: 8px; color: #666; text-align: center; line-height: 1.2;">
      ${urduTexts.powered_by}
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${urduTexts.print_options}</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      ${urduTexts.print_receipt}
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ${urduTexts.close}
    </button>
  </div>
</body>
</html>
  `.trim()
}

// Generate A4 Invoice HTML with table layout
export const generateA4InvoiceHTML = (data: PrintInvoiceData): string => {
  const {
    invoiceNumber,
    items,
    customerId,
    customerName,
    walkInCustomerName,
    type,
    // subtotal,
    // tax,
    // discount,
    total,
    // paidAmount,
    // balance,
    dueDate,
    notes,
    // deliveryCharge = 0,
    // serviceCharge = 0,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyTaxNumber
  } = data

  // Urdu translations for A4 invoice
  const urduTexts = {
    business_name: companyName || 'آپ کا کاروبار',
    business_address: companyAddress || 'آپ کا پتہ، شہر، ملک',
    business_phone: companyPhone || '+92 300 1234567',
    business_email: companyEmail || 'info@yourbusiness.com',
    tax_id: companyTaxNumber ? `ٹیکس آئی ڈی: ${companyTaxNumber}` : 'ٹیکس آئی ڈی: 123456789',
    invoice_title: 'انوائس',
    invoice_number: 'انوائس نمبر',
    date: 'تاریخ',
    time: 'وقت',
    type: 'قسم',
    customer: 'کسٹمر',
    due_date: 'آخری تاریخ',
    walk_in_customer: 'واک ان کسٹمر',
    bill_to: 'بل کی معلومات',
    invoice_details: 'انوائس کی تفصیلات',
    issue_date: 'تاریخ',
    items_count: 'اشیاء کی تعداد',
    product_name: 'پروڈکٹ کا نام',
    quantity: 'مقدار',
    unit_price: 'قیمت',
    total_amount: 'کل رقم',
    subtotal: 'ذیلی ٹوٹل',
    discount: 'رعایت',
    delivery_charge: 'ڈیلیوری چارج',
    service_charge: 'سروس چارج',
    tax: 'ٹیکس',
    total: 'کل',
    amount: 'رقم',
    payment_information: 'ادائیگی کی معلومات',
    amount_paid: 'ادا شدہ رقم',
    balance_due: 'باقی رقم',
    paid_in_full: 'مکمل ادائیگی',
    payment_status: 'ادائیگی کی صورتحال',
    completed: 'مکمل',
    pending_payment: 'ادائیگی باقی',
    previous_balance: 'پچھلا بیلنس',
    current_invoice: 'موجودہ انوائس',
    net_balance: 'کل بیلنس',
    invoice_barcode: 'انوائس بار کوڈ',
    scan_to_verify: 'تصدیق کے لیے اسکین کریں',
    additional_notes: 'اضافی نوٹس',
    thank_you: 'آپ کا شکریہ!',
    keep_receipt: 'براہ کرم یہ انوائس محفوظ رکھیں',
    generated_on: 'تیار کیا گیا',
    powered_by: 'Logix Plus Software Solutions',
    print_options: 'پرنٹ آپشنز',
    print_invoice: '🖨️ انوائس پرنٹ کریں',
    close: '✕ بند کریں',
    cash: 'cash',
    credit: 'credit',
    pending: 'pending'
  }

  const getTypeText = (type: string) => {
    switch(type) {
      case 'cash': return urduTexts.cash
      case 'credit': return urduTexts.credit
      case 'pending': return urduTexts.pending
      default: return type
    }
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${urduTexts.invoice_title} ${invoiceNumber}</title>
  <style>
    @media print {
      @page { 
        margin: 1in; 
        size: A4; 
      }
      body { 
        margin: 0; 
        padding: 0; 
        font-size: 12px;
      }
      .no-print {
        display: none !important;
      }
    }
    
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      margin: 0;
      padding: 20px;
      background: white;
      color: #000;
      direction: rtl;
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
      font-size: 28px;
      font-weight: bold;
      color: #007bff;
      margin-bottom: 5px;
    }
    
    .company-details {
      font-size: 12px;
      color: #666;
      line-height: 1.3;
    }
    
    .invoice-details {
      text-align: left;
      flex: 1;
    }
    
    .invoice-title {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
    }
    
    .invoice-meta {
      font-size: 12px;
      color: #666;
    }
    
    .invoice-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    
    .info-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .info-title {
      font-weight: bold;
      font-size: 16px;
      color: #333;
      margin-bottom: 5px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    
    .info-label {
      font-weight: 600;
      color: #555;
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
      text-align: right;
      font-weight: 800;
      font-size: 14px;
      border: 1px solid #0056b3;
      border-bottom: 2px solid #0056b3;
    }
    
    .items-table th:first-child {
      border-radius: 0 8px 0 0;
    }
    
    .items-table th:last-child {
      border-radius: 8px 0 0 0;
      text-align: left;
    }
    
    .items-table td {
      padding: 12px 8px;
      border: 1px solid #dee2e6;
      border-bottom: 1px solid #dee2e6;
      vertical-align: top;
      font-size: 13px;
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
    
    .items-table .text-right {
      text-align: left;
    }
    
    .items-table .text-center {
      text-align: center;
    }
    
    .items-table .text-left {
      text-align: right;
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 30px;
    }
    
    .totals-table {
      width: 300px;
      border-collapse: collapse;
      border: 2px solid black;
      border-radius: 8px;
      overflow: hidden;
    }
    
    .totals-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e9ecef;
      font-size: 13px;
    }
    
    .totals-table .total-label {
      font-weight: 700;
      text-align: left;
      background: #f8f9fa;
      border-right: 1px solid #dee2e6;
    }
    
    .totals-table .total-amount {
      text-align: right;
      font-weight: 600;
      background: white;
    }
    
    .totals-table .final-total {
      background: white;
      color: black;
      font-weight: bold;
      font-size: 16px;
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
    }
    
    .footer {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e9ecef;
    }
    
    .footer-line {
      margin-bottom: 5px;
    }
    
    .no-print {
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    
    .print-btn {
      padding: 10px 20px;
      margin: 0 10px;
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
      font-size: 11px;
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
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <div class="company-name">${urduTexts.business_name}</div>
      <div class="company-details">
        ${urduTexts.business_address}<br>
        ${urduTexts.business_phone}<br>
        ${urduTexts.business_email}<br>
        ${urduTexts.tax_id}
      </div>
    </div>
    <div class="invoice-details">
      <div class="invoice-title">${urduTexts.invoice_title}</div>
      <div class="invoice-meta">
        <div><strong>#${invoiceNumber}</strong></div>
        <div>${urduTexts.date}: ${new Date().toLocaleDateString('ur-PK')}</div>
        <div>${urduTexts.time}: ${new Date().toLocaleTimeString('ur-PK')}</div>
      </div>
    </div>
  </div>
  
  <div class="invoice-info">
    <div class="info-section">
      <div class="info-title">${urduTexts.bill_to}:</div>
      <div class="info-row">
        <span class="info-label">${urduTexts.customer}:</span>
        <span><strong>${customerId === 'walk-in' ? (walkInCustomerName || urduTexts.walk_in_customer) : (customerName || 'N/A')}</strong></span>
        <span class="status-badge status-${type}">${getTypeText(type)}</span>
      </div>
      ${type === 'credit' && dueDate ? `
      <div class="info-row">
        <span class="info-label">${urduTexts.due_date}:</span>
        <span><strong style="color: #d32f2f;">${new Date(dueDate).toLocaleDateString('ur-PK')}</strong></span>
      </div>
      ` : ''}
    </div>
    <div class="info-section">
      <div class="info-title">${urduTexts.invoice_details}:</div>
      <div class="info-row">
        <span class="info-label">${urduTexts.issue_date}:</span>
        <span>${new Date().toLocaleDateString('ur-PK')}</span>
      </div>
    </div>
  </div>
  
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

  ${(data.previousBalance !== undefined && data.previousBalance !== null && customerId !== 'walk-in') ? `
    <div style="padding-top: 15px; margin-top: 15px; margin-bottom: 20px;">
      <table class="totals-table" style="width: 400px;">
        <tr>
          <td class="total-label">${urduTexts.current_invoice}:</td>
          <td class="total-amount" style="color: #d32f2f; font-size: 14px;">${formatCurrency(total)} (Dr)</td>
        </tr>
        <tr>
          <td class="total-label">${urduTexts.previous_balance}:</td>
          <td class="total-amount" style="color: ${data.previousBalance > 0 ? '#d32f2f' : data.previousBalance < 0 ? '#2e7d32' : '#666'}; font-size: 14px;">
            ${formatCurrency(Math.abs(data.previousBalance || 0))} ${data.previousBalance > 0 ? '(Dr)' : data.previousBalance < 0 ? '(Cr)' : ''}
          </td>
        </tr>
        <tr>
          <td class="total-label">${urduTexts.net_balance}:</td>
          <td class="total-amount" style="font-size: 16px;">
            ${formatCurrency(Math.abs((data.previousBalance || 0) + total))} ${(data.previousBalance || 0) + total > 0 ? '(Receivable)' : '(Payable)'}
          </td>
        </tr>
      </table>
    </div>
  ` : ''}
  
 
  
  <div class="barcode-section">
    <div style="font-size: 14px; margin-bottom: 8px; font-weight: bold;">${urduTexts.invoice_barcode}</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${urduTexts.scan_to_verify}: ${invoiceNumber}</div>
  </div>
  
  ${notes ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">${urduTexts.additional_notes}:</div>
      <div style="font-size: 14px;">${notes}</div>
    </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line" style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">${urduTexts.thank_you}</div>
    <div class="footer-line">${urduTexts.keep_receipt}</div>
    <div style="margin-top: 15px; font-size: 11px; color: #777; text-align: center; line-height: 1.3;">
      ${urduTexts.powered_by}
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">${urduTexts.print_options}</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      ${urduTexts.print_invoice}
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ${urduTexts.close}
    </button>
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
    
    // Wait for all resources including fonts and images to load
    const waitForLoad = () => {
      if (printWindow.document.readyState === 'complete') {
        // Additional delay to ensure fonts are rendered
        setTimeout(() => {
          try {
            printWindow.print()
          } catch (error) {
            console.error('Print error:', error)
            // Fallback: close window if print fails
            printWindow.close()
          }
        }, 1000)
      } else {
        setTimeout(waitForLoad, 100)
      }
    }
    
    printWindow.onload = waitForLoad
    // Fallback in case onload doesn't trigger
    setTimeout(waitForLoad, 500)
  } else {
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
}

export const openA4PrintWindow = (htmlContent: string): void => {
  const printWindow = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes')
  
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    
    // Wait for all resources including fonts and images to load
    const waitForLoad = () => {
      if (printWindow.document.readyState === 'complete') {
        // Check if fonts are loaded
        if (printWindow.document.fonts && printWindow.document.fonts.status === 'loaded') {
          // Additional delay to ensure everything is rendered properly
          setTimeout(() => {
            try {
              printWindow.print()
            } catch (error) {
              console.error('A4 Print error:', error)
              // Fallback: close window if print fails
              printWindow.close()
            }
          }, 1500)
        } else {
          // Wait for fonts to load
          if (printWindow.document.fonts && printWindow.document.fonts.ready) {
            printWindow.document.fonts.ready.then(() => {
              setTimeout(() => {
                try {
                  printWindow.print()
                } catch (error) {
                  console.error('A4 Print error:', error)
                  printWindow.close()
                }
              }, 1000)
            }).catch(() => {
              // If font loading fails, still try to print
              setTimeout(() => {
                try {
                  printWindow.print()
                } catch (error) {
                  console.error('A4 Print error:', error)
                  printWindow.close()
                }
              }, 1000)
            })
          } else {
            // Fallback if fonts API not available
            setTimeout(() => {
              try {
                printWindow.print()
              } catch (error) {
                console.error('A4 Print error:', error)
                printWindow.close()
              }
            }, 1500)
          }
        }
      } else {
        setTimeout(waitForLoad, 100)
      }
    }
    
    printWindow.onload = waitForLoad
    // Fallback in case onload doesn't trigger
    setTimeout(waitForLoad, 500)
  } else {
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
}
