// Purchase invoice print utilities - Receipt and A4 formats

export function generatePurchaseInvoiceHTML(purchase: any, supplierName: string, t: any): string {
  const items = purchase.items || []
  const itemsHTML = items
    .map(
      (item: any) => `
    <tr>
      <td style="padding: 8px 4px; border-bottom: 1px dashed #ddd;">
        ${item.product?.name || item.name || ''}
      </td>
      <td style="padding: 8px 4px; text-align: center; border-bottom: 1px dashed #ddd;">
        ${item.quantity} ${item.unit || 'pcs'}
      </td>
      <td style="padding: 8px 4px; text-align: right; border-bottom: 1px dashed #ddd;">
        Rs ${item.priceAtPurchase?.toFixed(2) || '0.00'}
      </td>
      <td style="padding: 8px 4px; text-align: right; border-bottom: 1px dashed #ddd;">
        Rs ${item.total?.toFixed(2) || '0.00'}
      </td>
    </tr>
  `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${t('purchase_invoice')} - ${purchase.invoiceNumber}</title>
      <style>
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        body {
          font-family: 'Courier New', monospace;
          width: 80mm;
          margin: 0 auto;
          padding: 10mm;
          font-size: 12px;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #000;
        }
        .store-name {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .invoice-type {
          font-size: 14px;
          font-weight: bold;
          margin: 10px 0;
        }
        .info-section {
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px dashed #000;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        th {
          text-align: left;
          padding: 8px 4px;
          border-bottom: 2px solid #000;
          font-weight: bold;
        }
        td {
          padding: 8px 4px;
        }
        .totals {
          border-top: 2px solid #000;
          padding-top: 10px;
          margin-top: 10px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
        }
        .total-amount {
          font-size: 16px;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px dashed #000;
          font-size: 11px;
        }
        .notes {
          margin-top: 15px;
          padding: 10px;
          background: #f9f9f9;
          border: 1px dashed #ddd;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="store-name">${t('your_store_name')}</div>
        <div>${t('purchase_invoice')}</div>
        <div class="invoice-type">${purchase.invoiceNumber || ''}</div>
      </div>

      <div class="info-section">
        <div class="info-row">
          <span><strong>${t('supplier')}:</strong></span>
          <span>${supplierName}</span>
        </div>
        <div class="info-row">
          <span><strong>${t('date')}:</strong></span>
          <span>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>${t('item')}</th>
            <th style="text-align: center;">${t('qty')}</th>
            <th style="text-align: right;">${t('price')}</th>
            <th style="text-align: right;">${t('total')}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>${t('subtotal')}:</span>
          <span>Rs ${purchase.totalAmount?.toFixed(2) || '0.00'}</span>
        </div>
        <div class="total-row total-amount">
          <span>${t('total')}:</span>
          <span>Rs ${purchase.totalAmount?.toFixed(2) || '0.00'}</span>
        </div>
      </div>

      ${purchase.notes ? `
        <div class="notes">
          <strong>${t('notes')}:</strong><br>
          ${purchase.notes}
        </div>
      ` : ''}

      <div class="footer">
        <p>${t('thank_you_for_your_business')}</p>
        <p>${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `
}

export function generatePurchaseInvoiceA4HTML(purchase: any, supplierName: string, t: any): string {
  const items = purchase.items || []
  const itemsHTML = items
    .map(
      (item: any, index: number) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${item.product?.name || item.name || ''}
      </td>
      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb;">
        ${item.quantity} ${item.unit || 'pcs'}
      </td>
      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">
        Rs ${item.priceAtPurchase?.toFixed(2) || '0.00'}
      </td>
      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">
        Rs ${item.total?.toFixed(2) || '0.00'}
      </td>
    </tr>
  `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${t('purchase_invoice')} - ${purchase.invoiceNumber}</title>
      <style>
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 30px;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 3px solid #2563eb;
        }
        .company-info {
          flex: 1;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 10px;
        }
        .company-details {
          font-size: 12px;
          color: #6b7280;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-type {
          font-size: 24px;
          font-weight: bold;
          color: #059669;
          margin-bottom: 10px;
        }
        .invoice-number {
          font-size: 18px;
          color: #4b5563;
          margin-bottom: 5px;
        }
        .invoice-date {
          font-size: 14px;
          color: #6b7280;
        }
        .supplier-section {
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 10px;
        }
        .supplier-name {
          font-size: 18px;
          font-weight: 600;
          color: #059669;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        thead {
          background: #f3f4f6;
        }
        th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #d1d5db;
        }
        td {
          padding: 12px;
          color: #4b5563;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-top: 30px;
        }
        .totals-table {
          width: 350px;
        }
        .totals-table tr {
          border-bottom: 1px solid #e5e7eb;
        }
        .totals-table td {
          padding: 10px;
        }
        .totals-table .total-row {
          background: #f9fafb;
          font-weight: bold;
          font-size: 18px;
        }
        .notes-section {
          margin-top: 40px;
          padding: 20px;
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          border-radius: 4px;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 2px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="company-info">
            <div class="company-name">${t('your_store_name')}</div>
            <div class="company-details">
              ${t('address')}: 123 Main St, City<br>
              ${t('phone')}: (123) 456-7890<br>
              ${t('email')}: info@yourstore.com
            </div>
          </div>
          <div class="invoice-info">
            <div class="invoice-type">${t('purchase_invoice')}</div>
            <div class="invoice-number">${purchase.invoiceNumber || ''}</div>
            <div class="invoice-date">
              ${t('date')}: ${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div class="supplier-section">
          <div class="section-title">${t('supplier_details')}</div>
          <div class="supplier-name">${supplierName}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>${t('item_description')}</th>
              <th style="text-align: center; width: 100px;">${t('quantity')}</th>
              <th style="text-align: right; width: 120px;">${t('unit_price')}</th>
              <th style="text-align: right; width: 120px;">${t('total')}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals-section">
          <table class="totals-table">
            <tr>
              <td>${t('subtotal')}:</td>
              <td style="text-align: right;">Rs ${purchase.totalAmount?.toFixed(2) || '0.00'}</td>
            </tr>
            <tr class="total-row">
              <td>${t('total_amount')}:</td>
              <td style="text-align: right;">Rs ${purchase.totalAmount?.toFixed(2) || '0.00'}</td>
            </tr>
          </table>
        </div>

        ${purchase.notes ? `
          <div class="notes-section">
            <div class="section-title">${t('notes')}</div>
            <div>${purchase.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          <p>${t('thank_you_for_your_business')}</p>
          <p>${t('printed_on')}: ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </body>
    </html>
  `
}
