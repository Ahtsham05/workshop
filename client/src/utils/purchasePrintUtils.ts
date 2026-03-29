// Purchase invoice print utilities - Receipt and A4 formats

type BranchPrintDetails = {
  name?: string
  address?: string
  phone?: string
  email?: string
}

const resolvePrintLabel = (t: any, key: string, fallback: string): string => {
  if (typeof t !== 'function') return fallback
  const value = t(key)
  if (!value || typeof value !== 'string') return fallback

  const normalized = value.trim()
  // If translation is missing, many i18n setups return the raw key (often snake_case).
  if (!normalized || normalized === key || normalized.includes('_')) return fallback

  return normalized
}

const resolveUnitPrice = (item: any): number => {
  return Number(item?.priceAtPurchase ?? item?.purchasePrice ?? item?.unitPrice ?? 0)
}

const resolveLineTotal = (item: any): number => {
  const explicitTotal = Number(item?.total ?? item?.subtotal)
  if (!Number.isNaN(explicitTotal) && explicitTotal > 0) {
    return explicitTotal
  }
  return Number(item?.quantity || 0) * resolveUnitPrice(item)
}

const resolvePaymentType = (purchase: any): string => {
  if (purchase?.paymentType) return purchase.paymentType
  const balance = Number(purchase?.balance || 0)
  return balance > 0 ? 'Credit' : 'Cash'
}

const resolveTotalAmount = (purchase: any): number => {
  return Number(purchase?.totalAmount ?? purchase?.total ?? 0)
}

const resolvePaidAmount = (purchase: any): number => {
  return Number(purchase?.paidAmount || 0)
}

export function generatePurchaseInvoiceHTML(
  purchase: any,
  supplierName: string,
  t: any,
  branchDetails?: BranchPrintDetails
): string {
  const items = purchase.items || []
  const totalAmount = resolveTotalAmount(purchase)
  const paidAmount = resolvePaidAmount(purchase)
  const balance = Number(purchase?.balance ?? totalAmount - paidAmount)
  const paymentType = resolvePaymentType(purchase)
  const tr = (key: string, fallback: string) => resolvePrintLabel(t, key, fallback)

  const companyName = branchDetails?.name || tr('your_store_name', 'Your Store')
  const companyAddress = branchDetails?.address || '-'
  const companyPhone = branchDetails?.phone || '-'
  const companyEmail = branchDetails?.email || '-'

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
        Rs ${resolveUnitPrice(item).toFixed(2)}
      </td>
      <td style="padding: 8px 4px; text-align: right; border-bottom: 1px dashed #ddd;">
        Rs ${resolveLineTotal(item).toFixed(2)}
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
      <title>${tr('purchase_invoice', 'Purchase Invoice')} - ${purchase.invoiceNumber}</title>
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
        <div class="store-name">${companyName}</div>
        <div>${tr('address', 'Address')}: ${companyAddress}</div>
        <div>${tr('phone', 'Phone')}: ${companyPhone}</div>
        <div>${tr('email', 'Email')}: ${companyEmail}</div>
        <div>${tr('purchase_invoice', 'Purchase Invoice')}</div>
        <div class="invoice-type">${purchase.invoiceNumber || ''}</div>
      </div>

      <div class="info-section">
        <div class="info-row">
          <span><strong>${tr('supplier', 'Supplier')}:</strong></span>
          <span>${supplierName}</span>
        </div>
        <div class="info-row">
          <span><strong>${tr('date', 'Date')}:</strong></span>
          <span>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
        </div>
        <div class="info-row">
          <span><strong>${tr('payment_type', 'Payment Type')}:</strong></span>
          <span>${paymentType}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>${tr('item', 'Item')}</th>
            <th style="text-align: center;">${tr('qty', 'Qty')}</th>
            <th style="text-align: right;">${tr('price', 'Price')}</th>
            <th style="text-align: right;">${tr('total', 'Total')}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>${tr('subtotal', 'Subtotal')}:</span>
          <span>Rs ${totalAmount.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>${tr('paid', 'Paid')}:</span>
          <span>Rs ${paidAmount.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>${tr('balance_due', 'Balance Due')}:</span>
          <span>Rs ${Math.max(balance, 0).toFixed(2)}</span>
        </div>
        <div class="total-row total-amount">
          <span>${tr('total', 'Total')}:</span>
          <span>Rs ${totalAmount.toFixed(2)}</span>
        </div>
      </div>

      ${purchase.notes ? `
        <div class="notes">
          <strong>${tr('notes', 'Notes')}:</strong><br>
          ${purchase.notes}
        </div>
      ` : ''}

      <div class="footer">
        <p>${tr('thank_you_for_your_business', 'Thank you for your business')}</p>
        <p>${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `
}

export function generatePurchaseInvoiceA4HTML(
  purchase: any,
  supplierName: string,
  t: any,
  branchDetails?: BranchPrintDetails
): string {
  const items = purchase.items || []
  const totalAmount = resolveTotalAmount(purchase)
  const paidAmount = resolvePaidAmount(purchase)
  const balance = Number(purchase?.balance ?? totalAmount - paidAmount)
  const paymentType = resolvePaymentType(purchase)
  const tr = (key: string, fallback: string) => resolvePrintLabel(t, key, fallback)

  const companyName = branchDetails?.name || tr('your_store_name', 'Your Store')
  const companyAddress = branchDetails?.address || '-'
  const companyPhone = branchDetails?.phone || '-'
  const companyEmail = branchDetails?.email || '-'

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
        Rs ${resolveUnitPrice(item).toFixed(2)}
      </td>
      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">
        Rs ${resolveLineTotal(item).toFixed(2)}
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
      <title>${tr('purchase_invoice', 'Purchase Invoice')} - ${purchase.invoiceNumber}</title>
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
            <div class="company-name">${companyName}</div>
            <div class="company-details">
              ${tr('address', 'Address')}: ${companyAddress}<br>
              ${tr('phone', 'Phone')}: ${companyPhone}<br>
              ${tr('email', 'Email')}: ${companyEmail}
            </div>
          </div>
          <div class="invoice-info">
            <div class="invoice-type">${tr('purchase_invoice', 'Purchase Invoice')}</div>
            <div class="invoice-number">${purchase.invoiceNumber || ''}</div>
            <div class="invoice-date">
              ${tr('date', 'Date')}: ${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div class="supplier-section">
          <div class="section-title">${tr('supplier_details', 'Supplier Details')}</div>
          <div class="supplier-name">${supplierName}</div>
          <div style="margin-top: 8px; color: #4b5563;">
            <strong>${tr('payment_type', 'Payment Type')}:</strong> ${paymentType}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>${tr('item_description', 'Item Description')}</th>
              <th style="text-align: center; width: 100px;">${tr('quantity', 'Quantity')}</th>
              <th style="text-align: right; width: 120px;">${tr('unit_price', 'Unit Price')}</th>
              <th style="text-align: right; width: 120px;">${tr('total', 'Total')}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals-section">
          <table class="totals-table">
            <tr>
              <td>${tr('subtotal', 'Subtotal')}:</td>
              <td style="text-align: right;">Rs ${totalAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td>${tr('paid', 'Paid')}:</td>
              <td style="text-align: right;">Rs ${paidAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td>${tr('balance_due', 'Balance Due')}:</td>
              <td style="text-align: right;">Rs ${Math.max(balance, 0).toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>${tr('total_amount', 'Total Amount')}:</td>
              <td style="text-align: right;">Rs ${totalAmount.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        ${purchase.notes ? `
          <div class="notes-section">
            <div class="section-title">${tr('notes', 'Notes')}</div>
            <div>${purchase.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          <p>${tr('thank_you_for_your_business', 'Thank you for your business')}</p>
          <p>${tr('printed_on', 'Printed on')}: ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </body>
    </html>
  `
}
