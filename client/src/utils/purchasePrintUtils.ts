// Purchase invoice print utilities - delegates to the central language system
import { invoiceNoteToSafeHtml } from '@/lib/escape-html'
import { purchaseReceiptLabels, resolveInvoiceLanguage, type InvoiceLanguage } from '@/features/invoice/utils/language'

type BranchPrintDetails = {
  name?: string
  address?: string
  phone?: string
  email?: string
  logo?: string
  isTrial?: boolean
  invoiceNote?: string
}

const resolveUnitPrice = (item: any): number =>
  Number(item?.priceAtPurchase ?? item?.purchasePrice ?? item?.unitPrice ?? 0)

const resolveLineTotal = (item: any): number => {
  const explicitTotal = Number(item?.total ?? item?.subtotal)
  if (!Number.isNaN(explicitTotal) && explicitTotal > 0) return explicitTotal
  return Number(item?.quantity || 0) * resolveUnitPrice(item)
}

const resolvePaymentType = (purchase: any): string => {
  if (purchase?.paymentType) return purchase.paymentType
  return Number(purchase?.balance || 0) > 0 ? 'Credit' : 'Cash'
}

const resolveTotalAmount = (purchase: any): number =>
  Number(purchase?.totalAmount ?? purchase?.total ?? 0)

const resolvePaidAmount = (purchase: any): number =>
  Number(purchase?.paidAmount || 0)

const generateBarcodeText = (text: string): string => `*${text}*`
const formatCurrency = (amount: number): string => `Rs${amount.toFixed(2)}`

export function generatePurchaseInvoiceHTML(
  purchase: any,
  supplierName: string,
  _t: any,
  branchDetails?: BranchPrintDetails,
  languageOverride?: InvoiceLanguage
): string {
  const items = purchase.items || []
  const totalAmount = resolveTotalAmount(purchase)
  const paidAmount = resolvePaidAmount(purchase)
  const balance = Number(purchase?.balance ?? totalAmount - paidAmount)
  const paymentType = resolvePaymentType(purchase)

  const language = resolveInvoiceLanguage({
    language: languageOverride ?? purchase?.language,
    isUrduOnly: purchase?.isUrduOnly,
    userPreferredLanguage: purchase?.userPreferredLanguage,
  })
  const labels = purchaseReceiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'

  const companyName = branchDetails?.name || labels.not_available
  const companyAddress = branchDetails?.address || ''
  const companyPhone = branchDetails?.phone || ''
  const companyEmail = branchDetails?.email || ''

  const itemsHTML = items.map((item: any, index: number) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.product?.name || item.name || ''}</td>
      <td>${resolveUnitPrice(item).toFixed(2)}</td>
      <td>${item.quantity}</td>
      <td>${resolveLineTotal(item).toFixed(2)}</td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.purchase_invoice} - ${purchase.invoiceNumber}</title>
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
    ${branchDetails?.logo ? `<img src="${branchDetails.logo}" alt="${companyName}" class="company-logo" />` : branchDetails?.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" />` : ''}
    <div class="business-name">${companyName}</div>
    ${companyAddress ? `<div class="business-info">${companyAddress}</div>` : ''}
    ${companyPhone || companyEmail ? `<div class="business-info">${[companyPhone, companyEmail].filter(Boolean).join(' | ')}</div>` : ''}
    <div style="font-size: 13px; font-weight: bold; margin-top: 6px; border: 1px solid #000; display: inline-block; padding: 2px 10px;">${labels.purchase_invoice}</div>
  </div>

  <div class="invoice-info">
    <div class="info-row"><span class="info-label">${labels.invoice_number}:</span><span class="highlight">${purchase.invoiceNumber || ''}</span></div>
    <div class="info-row"><span class="info-label">${labels.date}:</span><span>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString(locale) : new Date().toLocaleDateString(locale)} ${new Date().toLocaleTimeString(locale)}</span></div>
    <div class="info-row"><span class="info-label">${labels.supplier}:</span><span>${supplierName}</span></div>
    <div class="info-row"><span class="info-label">${labels.payment_type}:</span><span>${paymentType}</span></div>
  </div>

  <div class="items-section">
    <div class="items-header">${labels.items_purchased}</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>S.r.</th>
          <th>${labels.item}</th>
          <th>${labels.price}</th>
          <th>${labels.qty}</th>
          <th>${labels.total}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
        <tr class="total-row-table">
          <td colspan="2">${labels.total}:</td>
          <td></td>
          <td>${items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)}</td>
          <td>${totalAmount.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="totals-section">
    <div class="total-row total-final"><span>${labels.total}:</span><span>${formatCurrency(totalAmount)}</span></div>
  </div>

  <div class="payment-section">
    <div class="total-row" style="margin-bottom: 3px;"><span>${labels.paid}:</span><span class="highlight">${formatCurrency(paidAmount)}</span></div>
    ${balance > 0 ? `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>${labels.balance_due}:</strong></span><span><strong>${formatCurrency(balance)}</strong></span></div>` : `<div class="total-row" style="color: #000; font-weight: bold;"><span><strong>${labels.paid_in_full}</strong></span><span>✓</span></div>`}
  </div>

  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">${labels.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
    <div class="barcode-text">${purchase.invoiceNumber || ''}</div>
  </div>

  ${purchase.notes ? `<div class="notes-section"><div style="font-weight: bold; margin-bottom: 3px;">${labels.notes}:</div><div>${purchase.notes}</div></div>` : ''}

  ${branchDetails?.invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(branchDetails.invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${labels.thank_you}</strong></div>
    <div class="footer-line">${labels.keep_receipt}</div>
    <div style="margin-top: 8px; font-size: 10px; color: #000; font-weight: bold; text-align: center; line-height: 1.2;">${labels.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${labels.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${labels.print_receipt}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${labels.close}</button>
  </div>
</body>
</html>
  `.trim()
}

export function generatePurchaseInvoiceA4HTML(
  purchase: any,
  supplierName: string,
  _t: any,
  branchDetails?: BranchPrintDetails,
  languageOverride?: InvoiceLanguage
): string {
  const items = purchase.items || []
  const totalAmount = resolveTotalAmount(purchase)
  const paidAmount = resolvePaidAmount(purchase)
  const balance = Number(purchase?.balance ?? totalAmount - paidAmount)
  const paymentType = resolvePaymentType(purchase)

  const language = resolveInvoiceLanguage({
    language: languageOverride ?? purchase?.language,
    isUrduOnly: purchase?.isUrduOnly,
    userPreferredLanguage: purchase?.userPreferredLanguage,
  })
  const labels = purchaseReceiptLabels[language]
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'
  const endAlign = language === 'ur' ? 'left' : 'right'

  const companyName = branchDetails?.name || labels.not_available
  const companyAddress = branchDetails?.address || ''
  const companyPhone = branchDetails?.phone || ''
  const companyEmail = branchDetails?.email || ''

  const itemsHTML = items.map((item: any, index: number) => `
    <tr>
      <td class="text-center"><strong>${index + 1}</strong></td>
      <td class="text-left"><strong>${item.product?.name || item.name || ''}</strong></td>
      <td class="text-center"><strong>${item.quantity} ${item.unit || 'pcs'}</strong></td>
      <td class="text-right"><strong>${formatCurrency(resolveUnitPrice(item))}</strong></td>
      <td class="text-right"><strong>${formatCurrency(resolveLineTotal(item))}</strong></td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.purchase_invoice} - ${purchase.invoiceNumber}</title>
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
    .invoice-branch-note { margin: 24px 0 0; padding: 16px; background: #fafafa; border: 1px dashed #ccc; border-radius: 6px; font-size: 13px; text-align: center; line-height: 1.45; white-space: normal; word-break: break-word; }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 40px; padding-top: 20px; border-top: 2px solid #e9ecef; }
    .footer-line { margin-bottom: 5px; }
    .no-print { text-align: center; margin: 30px 0; padding: 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; }
    .print-btn { padding: 10px 20px; margin: 0 10px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .status-cash { background: #d4edda; color: #155724; } .status-credit { background: #cce5ff; color: #004085; } .status-pending { background: #fff3cd; color: #856404; }
    @media screen { body { max-width: 800px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 40px; border-radius: 12px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      ${branchDetails?.logo ? `<img src="${branchDetails.logo}" alt="${companyName}" class="company-logo" />` : branchDetails?.isTrial ? `<img src="/images/logo-light.png" alt="Logix Plus Solutions" class="company-logo" />` : ''}
      <div class="company-name">${companyName}</div>
      <div class="company-details">
        ${companyAddress ? `${companyAddress}<br>` : ''}
        ${companyPhone ? `${companyPhone}<br>` : ''}
        ${companyEmail || ''}
      </div>
    </div>
    <div class="invoice-details">
      <div class="invoice-title">${labels.purchase_invoice}</div>
      <div class="invoice-meta">
        <div><strong>#${purchase.invoiceNumber || ''}</strong></div>
        <div>${labels.date}: ${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString(locale) : new Date().toLocaleDateString(locale)}</div>
        <div>${labels.time}: ${new Date().toLocaleTimeString(locale)}</div>
      </div>
    </div>
  </div>

  <div class="invoice-info">
    <div class="info-section">
      <div class="info-title">${labels.supplier}:</div>
      <div class="info-row">
        <span><strong>${supplierName}</strong></span>
        <span class="status-badge status-${paymentType.toLowerCase()}">${paymentType}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-title">${labels.invoice_number}:</div>
      <div class="info-row"><span>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString(locale) : new Date().toLocaleDateString(locale)}</span></div>
    </div>
  </div>

  <table class="items-table">
    <thead><tr>
      <th style="width: 5%;">#</th>
      <th style="width: 40%;">${labels.item}</th>
      <th style="width: 12%;" class="text-center">${labels.qty}</th>
      <th style="width: 15%;" class="text-right">${labels.price}</th>
      <th style="width: 18%;" class="text-right">${labels.total}</th>
    </tr></thead>
    <tbody>${itemsHTML}</tbody>
  </table>

  <div style="padding-top: 20px; margin-bottom: 20px;">
    <table class="totals-table">
      <tr><td class="total-label">${labels.subtotal}:</td><td class="total-amount">${formatCurrency(totalAmount)}</td></tr>
      <tr class="final-total"><td class="total-label">${labels.total}:</td><td class="total-amount" style="font-size: 16px; font-weight: bold;">${formatCurrency(totalAmount)}</td></tr>
    </table>
  </div>

  <div style="padding-top: 20px; margin-bottom: 20px;">
    <table class="totals-table">
      <tr style="background: #e8f5e9;"><td class="total-label" style="background: #e8f5e9;">${labels.paid}:</td><td class="total-amount" style="background: #e8f5e9; font-size: 14px; font-weight: bold;">${formatCurrency(paidAmount)}</td></tr>
      <tr><td class="total-label" style="font-weight: bold; color: #000;">${labels.balance_due}:</td><td class="total-amount" style="font-size: 14px; font-weight: bold; color: #000;">${formatCurrency(Math.max(balance, 0))}</td></tr>
    </table>
  </div>

  <div class="barcode-section">
    <div style="font-size: 14px; margin-bottom: 8px; font-weight: bold;">${labels.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
    <div class="barcode-text">${purchase.invoiceNumber || ''}</div>
  </div>

  ${purchase.notes ? `<div class="notes-section"><div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">${labels.notes}:</div><div style="font-size: 14px;">${purchase.notes}</div></div>` : ''}

  ${branchDetails?.invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(branchDetails.invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line" style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">${labels.thank_you}</div>
    <div class="footer-line">${labels.keep_receipt}</div>
    <div style="margin-top: 15px; font-size: 12px; color: #000; font-weight: bold; text-align: center; line-height: 1.3;">${labels.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">${labels.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${labels.print_receipt}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${labels.close}</button>
  </div>
</body>
</html>
  `.trim()
}
