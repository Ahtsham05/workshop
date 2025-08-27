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
      <span>${customerId === 'walk-in' ? 'Walk-in Customer' : (customerName || 'N/A')}</span>
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
