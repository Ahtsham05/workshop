export interface PrintInvoiceData {
  invoiceNumber: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  customerId?: string
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
    serviceCharge = 0
  } = data

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNumber}</title>
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
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.3;
      margin: 0;
      padding: 8px;
      width: 300px;
      background: white;
      color: #000;
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
  <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    <div class="business-name">Your Business Name</div>
    <div class="business-info">123 Business Street, City, State 12345</div>
    <div class="business-info">Phone: (555) 123-4567 | Email: info@business.com</div>
    <div class="business-info">Tax ID: 123-456-789</div>
  </div>
  
  <div class="invoice-info">
    <div class="info-row">
      <span class="info-label">Invoice #:</span>
      <span class="highlight">${invoiceNumber}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date:</span>
      <span>${new Date().toLocaleDateString()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Time:</span>
      <span>${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Type:</span>
      <span>${type.toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Customer:</span>
      <span>${customerId === 'walk-in' ? (walkInCustomerName || 'Walk-in Customer') : (customerName || 'N/A')}</span>
    </div>
    ${type === 'credit' && dueDate ? `
    <div class="info-row">
      <span class="info-label">Due Date:</span>
      <span>${new Date(dueDate).toLocaleDateString()}</span>
    </div>
    ` : ''}
  </div>
  
  <div class="items-section">
    <div class="items-header">ITEMS PURCHASED</div>
    ${items.map((item, index) => `
      <div class="item-row">
        <div class="item-name">${index + 1}. ${item.name}</div>
        <div class="item-details">
          <span>${item.quantity} × ${formatCurrency(item.unitPrice)}</span>
          <span><strong>${formatCurrency(item.subtotal)}</strong></span>
        </div>
      </div>
    `).join('')}
  </div>
  
  <div class="totals-section">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>
    ${discount > 0 ? `
    <div class="total-row">
      <span>Discount:</span>
      <span>-${formatCurrency(discount)}</span>
    </div>
    ` : ''}
    ${deliveryCharge > 0 ? `
    <div class="total-row">
      <span>Delivery:</span>
      <span>${formatCurrency(deliveryCharge)}</span>
    </div>
    ` : ''}
    ${serviceCharge > 0 ? `
    <div class="total-row">
      <span>Service:</span>
      <span>${formatCurrency(serviceCharge)}</span>
    </div>
    ` : ''}
    ${tax > 0 ? `
    <div class="total-row">
      <span>Tax:</span>
      <span>${formatCurrency(tax)}</span>
    </div>
    ` : ''}
    <div class="total-row total-final">
      <span>TOTAL:</span>
      <span>${formatCurrency(total)}</span>
    </div>
  </div>
  
  ${type !== 'pending' ? `
    <div class="payment-section">
      <div class="total-row">
        <span>Paid:</span>
        <span class="highlight">${formatCurrency(paidAmount)}</span>
      </div>
      ${balance > 0 ? `
      <div class="total-row" style="color: #d32f2f;">
        <span><strong>Balance Due:</strong></span>
        <span><strong>${formatCurrency(balance)}</strong></span>
      </div>
      ` : ''}
      ${balance === 0 ? `
      <div class="total-row" style="color: #2e7d32;">
        <span><strong>PAID IN FULL</strong></span>
        <span>✓</span>
      </div>
      ` : ''}
    </div>
  ` : ''}
  
  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">Invoice Number</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">${invoiceNumber}</div>
  </div>
  
  ${notes ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 3px;">Notes:</div>
      <div>${notes}</div>
    </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line"><strong>Thank you for your business!</strong></div>
    <div class="footer-line">Please keep this receipt for your records</div>
    <div class="footer-line">Visit us again soon</div>
    <div style="margin-top: 6px; font-size: 7px; color: #666;">
      Powered by Your POS System - ${new Date().toLocaleString()}
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">Print Options</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      🖨️ Print Receipt
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ✕ Close
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
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    balance,
    dueDate,
    notes,
    deliveryCharge = 0,
    serviceCharge = 0
  } = data

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNumber}</title>
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
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      line-height: 1.4;
      margin: 0;
      padding: 20px;
      background: white;
      color: #000;
    }
    
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      border-bottom: 3px solid #007bff;
      padding-bottom: 20px;
    }
    
    .company-info {
      flex: 1;
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
      text-align: right;
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
    }
    
    .items-table th {
      background: #007bff;
      color: white;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      border: none;
    }
    
    .items-table th:first-child {
      border-radius: 8px 0 0 0;
    }
    
    .items-table th:last-child {
      border-radius: 0 8px 0 0;
      text-align: right;
    }
    
    .items-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e9ecef;
      vertical-align: top;
    }
    
    .items-table tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .items-table tr:hover {
      background: #e3f2fd;
    }
    
    .items-table .text-right {
      text-align: right;
    }
    
    .items-table .text-center {
      text-align: center;
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    
    .totals-table {
      width: 300px;
      border-collapse: collapse;
    }
    
    .totals-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e9ecef;
    }
    
    .totals-table .total-label {
      font-weight: 600;
      text-align: right;
    }
    
    .totals-table .total-amount {
      text-align: right;
      font-weight: 500;
    }
    
    .totals-table .final-total {
      background: #007bff;
      color: white;
      font-weight: bold;
      font-size: 16px;
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
      border-left: 4px solid #007bff;
      border-radius: 0 8px 8px 0;
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
  <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <div class="company-name">Your Business Name</div>
      <div class="company-details">
        123 Business Street<br>
        City, State 12345<br>
        Phone: (555) 123-4567<br>
        Email: info@business.com<br>
        Tax ID: 123-456-789
      </div>
    </div>
    <div class="invoice-details">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><strong>#${invoiceNumber}</strong></div>
        <div>Date: ${new Date().toLocaleDateString()}</div>
        <div>Time: ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
  </div>
  
  <div class="invoice-info">
    <div class="info-section">
      <div class="info-title">Bill To:</div>
      <div class="info-row">
        <span class="info-label">Customer:</span>
        <span><strong>${customerId === 'walk-in' ? (walkInCustomerName || 'Walk-in Customer') : (customerName || 'N/A')}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Type:</span>
        <span class="status-badge status-${type}">${type.toUpperCase()}</span>
      </div>
      ${type === 'credit' && dueDate ? `
      <div class="info-row">
        <span class="info-label">Due Date:</span>
        <span><strong style="color: #d32f2f;">${new Date(dueDate).toLocaleDateString()}</strong></span>
      </div>
      ` : ''}
    </div>
    <div class="info-section">
      <div class="info-title">Invoice Details:</div>
      <div class="info-row">
        <span class="info-label">Invoice Number:</span>
        <span><strong>${invoiceNumber}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Issue Date:</span>
        <span>${new Date().toLocaleDateString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Items Count:</span>
        <span>${items.length}</span>
      </div>
    </div>
  </div>
  
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 45%;">Product Name</th>
        <th style="width: 15%;" class="text-center">Quantity</th>
        <th style="width: 15%;" class="text-right">Unit Price</th>
        <th style="width: 20%;" class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, index) => `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td><strong>${item.name}</strong></td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-right">${formatCurrency(item.unitPrice)}</td>
          <td class="text-right"><strong>${formatCurrency(item.subtotal)}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="totals-section">
    <table class="totals-table">
      <tr>
        <td class="total-label">Subtotal:</td>
        <td class="total-amount">${formatCurrency(subtotal)}</td>
      </tr>
      ${discount > 0 ? `
      <tr>
        <td class="total-label">Discount:</td>
        <td class="total-amount" style="color: #d32f2f;">-${formatCurrency(discount)}</td>
      </tr>
      ` : ''}
      ${deliveryCharge > 0 ? `
      <tr>
        <td class="total-label">Delivery Charge:</td>
        <td class="total-amount">${formatCurrency(deliveryCharge)}</td>
      </tr>
      ` : ''}
      ${serviceCharge > 0 ? `
      <tr>
        <td class="total-label">Service Charge:</td>
        <td class="total-amount">${formatCurrency(serviceCharge)}</td>
      </tr>
      ` : ''}
      ${tax > 0 ? `
      <tr>
        <td class="total-label">Tax:</td>
        <td class="total-amount">${formatCurrency(tax)}</td>
      </tr>
      ` : ''}
      <tr class="final-total">
        <td class="total-label">TOTAL AMOUNT:</td>
        <td class="total-amount">${formatCurrency(total)}</td>
      </tr>
    </table>
  </div>
  
  ${type !== 'pending' ? `
    <div class="payment-info">
      <div>
        <div class="info-title">Payment Information:</div>
        <div class="info-row">
          <span class="info-label">Amount Paid:</span>
          <span style="color: #2e7d32; font-weight: bold;">${formatCurrency(paidAmount)}</span>
        </div>
        ${balance > 0 ? `
        <div class="info-row">
          <span class="info-label"><strong>Balance Due:</strong></span>
          <span style="color: #d32f2f; font-weight: bold; font-size: 16px;">${formatCurrency(balance)}</span>
        </div>
        ` : ''}
        ${balance === 0 ? `
        <div class="info-row">
          <span style="color: #2e7d32; font-weight: bold;">✓ PAID IN FULL</span>
          <span></span>
        </div>
        ` : ''}
      </div>
      <div>
        <div class="info-title">Payment Status:</div>
        <div style="font-size: 16px; font-weight: bold; ${balance === 0 ? 'color: #2e7d32;' : 'color: #d32f2f;'}">
          ${balance === 0 ? '✓ COMPLETED' : '⚠ PENDING PAYMENT'}
        </div>
      </div>
    </div>
  ` : ''}
  
  <div class="barcode-section">
    <div style="font-size: 14px; margin-bottom: 8px; font-weight: bold;">Invoice Barcode</div>
    <div class="barcode">${generateBarcodeText(invoiceNumber)}</div>
    <div class="barcode-text">Scan to verify invoice: ${invoiceNumber}</div>
  </div>
  
  ${notes ? `
    <div class="notes-section">
      <div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">Additional Notes:</div>
      <div style="font-size: 14px;">${notes}</div>
    </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-line" style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Thank you for your business!</div>
    <div class="footer-line">Please keep this invoice for your records</div>
    <div class="footer-line">For any questions regarding this invoice, please contact us</div>
    <div style="margin-top: 15px; font-size: 10px; color: #999;">
      Generated on ${new Date().toLocaleString()} | Powered by Your POS System
    </div>
  </div>
  
  <div class="no-print">
    <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">Print Options</div>
    <button 
      onclick="window.print()" 
      class="print-btn print-btn-primary"
    >
      🖨️ Print Invoice
    </button>
    <button 
      onclick="window.close()" 
      class="print-btn print-btn-secondary"
    >
      ✕ Close
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
    
    // Auto print after content loads
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
      }, 500) // Increased delay for better loading
    }
  } else {
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
}

export const openA4PrintWindow = (htmlContent: string): void => {
  const printWindow = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes')
  
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    
    // Auto print after content loads
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
      }, 500) // Increased delay for better loading
    }
  } else {
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
}
