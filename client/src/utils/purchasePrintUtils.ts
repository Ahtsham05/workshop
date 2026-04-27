// Purchase invoice print utilities — Receipt (80mm) and A4 formats

interface PurchasePrintOptions {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxNumber?: string
  previousBalance?: number   // supplier balance BEFORE this purchase
}

const formatCurrency = (amount: number): string => `Rs ${amount.toFixed(2)}`

const generateBarcodeText = (text: string): string => `*${text}*`

// ─── Receipt (80mm thermal) ────────────────────────────────────────────────

export function generatePurchaseInvoiceHTML(
  purchase: any,
  supplierName: string,
  _t: any,
  opts: PurchasePrintOptions = {}
): string {
  const items        = purchase.items || []
  const totalAmount  = purchase.totalAmount || 0
  const paidAmount   = purchase.paidAmount  || 0
  // const balance      = purchase.balance ?? (totalAmount - paidAmount)
  const prevBal      = opts.previousBalance ?? 0
  const hasPrev      = opts.previousBalance !== undefined && opts.previousBalance !== null
  const totalOwed    = prevBal + totalAmount
  const newBalance   = totalOwed - paidAmount
  const purchaseDate = purchase.purchaseDate
    ? new Date(purchase.purchaseDate).toLocaleDateString('ur-PK')
    : new Date().toLocaleDateString('ur-PK')

  const companyName    = opts.companyName    || 'آپ کا کاروبار'
  const companyAddress = opts.companyAddress || ''
  const companyPhone   = opts.companyPhone   || ''
  const taxId          = opts.companyTaxNumber ? `ٹیکس: ${opts.companyTaxNumber}` : ''

  const texts = {
    purchase_invoice : 'خریداری انوائس',
    invoice_number   : 'انوائس نمبر',
    date             : 'تاریخ',
    supplier         : 'سپلائر',
    payment_type     : 'ادائیگی کا طریقہ',
    product          : 'پروڈکٹ',
    price            : 'قیمت',
    qty              : 'مقدار',
    amount           : 'رقم',
    total            : 'کل',
    previous_balance : 'پچھلا بیلنس',
    current_purchase : 'موجودہ خریداری',
    total_payable    : 'کل واجب الادا',
    paid             : 'ادا شدہ',
    balance_due      : 'باقی رقم',
    paid_in_full     : 'مکمل ادائیگی',
    notes            : 'نوٹس',
    thank_you        : 'آپ کا شکریہ!',
    keep_receipt     : 'براہ کرم یہ رسید محفوظ رکھیں',
    visit_again      : 'دوبارہ تشریف لائیے گا',
    powered_by       : 'Logix Plus Software Solutions',
    print_options    : 'پرنٹ آپشنز',
    print_receipt    : '🖨️ رسید پرنٹ کریں',
    close            : '✕ بند کریں',
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} ${purchase.invoiceNumber || ''}</title>
  <style>
    @media print {
      @page { margin: 5mm; size: 80mm auto; }
      body  { margin: 0; padding: 0; font-size: 11px; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter','Manrope','Noto Nastaliq Urdu',system-ui,sans-serif;
      font-size: 12px; line-height: 1.3; margin: 0; padding: 8px;
      width: 300px; background: white; color: #000; direction: rtl;
    }
    .receipt-header {
      text-align: center; margin-bottom: 12px;
      border-bottom: 2px solid #000; padding-bottom: 8px;
    }
    .company-logo { max-width: 120px; height: auto; margin: 0 auto 8px; display: block; }
    .business-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
    .business-info  { font-size: 9px; margin-bottom: 1px; }
    .invoice-info   { margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    .info-row       { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px; }
    .info-label     { font-weight: bold; }
    .items-section  { margin-bottom: 12px; }
    .items-table    { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    .items-table th { border-bottom: 1px solid #000; padding: 3px 2px; font-weight: bold; font-size: 9px; text-align: right; }
    .items-table td { padding: 3px 2px; border-bottom: 1px dotted #ccc; font-size: 10px; text-align: right; }
    .col-sr      { width: 18px; text-align: center; }
    .col-product { text-align: right; word-wrap: break-word; }
    .col-price   { width: 50px; white-space: nowrap; }
    .col-qty     { width: 32px; text-align: center; white-space: nowrap; }
    .col-amount  { width: 58px; white-space: nowrap; }
    .totals-section { border-top: 2px solid #000; padding-top: 8px; margin-bottom: 8px; }
    .total-row   { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px; }
    .total-final { font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; }
    .payment-section { margin-bottom: 12px; border-top: 1px dashed #000; padding-top: 8px; }
    .barcode-section { text-align: center; margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    .barcode      { font-family: 'Libre Barcode 39','Courier New',monospace; font-size: 20px; letter-spacing: 1px; margin: 6px 0; font-weight: normal; direction: ltr; }
    .barcode-text { font-size: 8px; margin-top: 2px; }
    .notes-section{ margin: 12px 0; padding: 8px 0; border-top: 1px dashed #000; font-size: 9px; }
    .footer       { text-align: center; font-size: 9px; margin-top: 12px; border-top: 2px solid #000; padding-top: 8px; }
    .footer-line  { margin-bottom: 2px; }
    .highlight    { background: #ffffcc; padding: 1px 2px; }
    .no-print     { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn    { padding: 8px 16px; margin: 0 5px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; }
    .print-btn-primary   { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    @media screen { body { max-width: 350px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,.1); padding: 20px; border-radius: 8px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    <img src="/images/logo-light.jpeg" alt="Logo" class="company-logo" />
    <div class="business-name">${companyName}</div>
    <div class="business-info">${texts.purchase_invoice}</div>
    ${companyAddress ? `<div class="business-info">${companyAddress}</div>` : ''}
    ${companyPhone   ? `<div class="business-info">${companyPhone}</div>` : ''}
    ${taxId          ? `<div class="business-info">${taxId}</div>` : ''}
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
      <span>${purchaseDate}</span>
    </div>
    ${purchase.paymentType ? `
    <div class="info-row">
      <span class="info-label">${texts.payment_type}:</span>
      <span>${purchase.paymentType}</span>
    </div>` : ''}
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
          const price     = item.purchasePrice || item.priceAtPurchase || item.unitPrice || 0
          const qty       = item.quantity || 0
          const itemTotal = item.total || price * qty
          const name      = item.product?.name || item.name || ''
          const unit      = item.unit || item.product?.unit || 'pcs'
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
    <div class="total-row" style="font-size:11px;font-weight:bold;margin-bottom:3px;">
      <span>${texts.current_purchase}:</span>
      <span>${formatCurrency(totalAmount)}</span>
    </div>
    ${hasPrev ? `
    <div class="total-row" style="font-size:10px;color:#666;margin-bottom:3px;">
      <span>${texts.previous_balance}:</span>
      <span style="color:${prevBal > 0 ? '#d32f2f' : prevBal < 0 ? '#2e7d32' : '#666'}">
        ${formatCurrency(Math.abs(prevBal))} ${prevBal > 0 ? '(Dr)' : prevBal < 0 ? '(Cr)' : ''}
      </span>
    </div>
    <div class="total-row" style="font-size:11px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;color:#d32f2f;">
      <span>${texts.total_payable}:</span>
      <span>${formatCurrency(totalOwed)}</span>
    </div>` : ''}
    <div class="total-row" style="margin-bottom:3px;">
      <span>${texts.paid}:</span>
      <span class="highlight">${formatCurrency(paidAmount)}</span>
    </div>
    <div class="total-row" style="font-weight:bold;color:${newBalance > 0 ? '#d32f2f' : '#2e7d32'};">
      <span><strong>${newBalance > 0 ? texts.balance_due : texts.paid_in_full}:</strong></span>
      <span><strong>${newBalance > 0 ? formatCurrency(newBalance) : '✓'}</strong></span>
    </div>
  </div>

  <div class="barcode-section">
    <div style="font-size:10px;margin-bottom:4px;">${texts.invoice_number}</div>
    <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
    <div class="barcode-text">${purchase.invoiceNumber || ''}</div>
  </div>

  ${purchase.notes ? `
  <div class="notes-section">
    <div style="font-weight:bold;margin-bottom:3px;">${texts.notes}:</div>
    <div>${purchase.notes}</div>
  </div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>${texts.thank_you}</strong></div>
    <div class="footer-line">${texts.keep_receipt}</div>
    <div class="footer-line">${texts.visit_again}</div>
    <div style="margin-top:8px;font-size:10px;color:#000;font-weight:bold;text-align:center;">${texts.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom:10px;font-weight:bold;">${texts.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${texts.print_receipt}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${texts.close}</button>
  </div>
</body>
</html>`.trim()
}

// ─── A4 format ────────────────────────────────────────────────────────────

export function generatePurchaseInvoiceA4HTML(
  purchase: any,
  supplierName: string,
  _t: any,
  opts: PurchasePrintOptions = {}
): string {
  const items        = purchase.items || []
  const totalAmount  = purchase.totalAmount || 0
  const paidAmount   = purchase.paidAmount  || 0
  // const balance      = purchase.balance ?? (totalAmount - paidAmount)
  const prevBal      = opts.previousBalance ?? 0
  const hasPrev      = opts.previousBalance !== undefined && opts.previousBalance !== null
  const totalOwed    = prevBal + totalAmount
  const newBalance   = totalOwed - paidAmount
  const purchaseDate = purchase.purchaseDate
    ? new Date(purchase.purchaseDate).toLocaleDateString('ur-PK')
    : new Date().toLocaleDateString('ur-PK')

  const companyName    = opts.companyName    || 'آپ کا کاروبار'
  const companyAddress = opts.companyAddress || ''
  const companyPhone   = opts.companyPhone   || ''
  const companyEmail   = opts.companyEmail   || ''
  const taxId          = opts.companyTaxNumber ? `ٹیکس: ${opts.companyTaxNumber}` : ''

  const texts = {
    purchase_invoice  : 'خریداری انوائس',
    invoice_number    : 'انوائس نمبر',
    date              : 'تاریخ',
    supplier          : 'سپلائر',
    supplier_details  : 'سپلائر کی تفصیلات',
    payment_type      : 'ادائیگی کا طریقہ',
    product_name      : 'پروڈکٹ کا نام',
    quantity          : 'مقدار',
    unit_price        : 'قیمت فی یونٹ',
    total_amount      : 'کل رقم',
    subtotal          : 'ذیلی ٹوٹل',
    total             : 'کل',
    previous_balance  : 'پچھلا بیلنس',
    current_purchase  : 'موجودہ خریداری',
    total_payable     : 'کل واجب الادا',
    paid              : 'ادا شدہ رقم',
    balance_due       : 'باقی رقم',
    paid_in_full      : 'مکمل ادائیگی',
    payment_information: 'ادائیگی کی معلومات',
    account_summary   : 'حساب کا خلاصہ',
    notes             : 'نوٹس',
    invoice_barcode   : 'انوائس بار کوڈ',
    scan_to_verify    : 'تصدیق کے لیے اسکین کریں',
    thank_you         : 'آپ کا شکریہ!',
    keep_receipt      : 'براہ کرم یہ انوائس محفوظ رکھیں',
    generated_on      : 'تیار کیا گیا',
    powered_by        : 'Logix Plus Software Solutions',
    print_options     : 'پرنٹ آپشنز',
    print_invoice     : '🖨️ انوائس پرنٹ کریں',
    close             : '✕ بند کریں',
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="UTF-8">
  <title>${texts.purchase_invoice} - ${purchase.invoiceNumber || ''}</title>
  <style>
    @media print {
      @page { margin: 15mm; size: A4; }
      body  { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter','Manrope','Noto Nastaliq Urdu',system-ui,sans-serif;
      font-size: 14px; line-height: 1.6; margin: 0; padding: 30px;
      background: white; color: #000; direction: rtl;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 30px; padding-bottom: 15px; border-bottom: 3px solid #1a56db;
    }
    .company-info { flex: 1; }
    .company-logo { max-width: 80px; height: auto; margin-bottom: 8px; }
    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 4px; color: #1a56db; }
    .company-details { font-size: 12px; color: #555; line-height: 1.4; }
    .invoice-meta { text-align: left; }
    .invoice-type-label { font-size: 20px; font-weight: bold; margin-bottom: 8px; color: #1a56db; }
    .invoice-number { font-size: 16px; margin-bottom: 4px; font-weight: 600; }
    .invoice-date   { font-size: 13px; color: #555; }
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
      margin-bottom: 25px; padding: 16px; background: #f8f9fa; border-radius: 8px;
    }
    .info-section { display: flex; flex-direction: column; gap: 6px; }
    .info-title   { font-weight: bold; font-size: 15px; color: #333; margin-bottom: 4px; border-bottom: 1px solid #dee2e6; padding-bottom: 4px; }
    .info-row     { display: flex; justify-content: space-between; font-size: 13px; }
    .info-label   { font-weight: 600; color: #555; }
    .items-table  { width: 100%; border-collapse: collapse; margin-bottom: 25px; border: 2px solid #1a56db; }
    .items-table th { background: #1a56db; color: white; padding: 10px 12px; text-align: right; font-weight: 700; font-size: 13px; border: 1px solid #1240a6; }
    .items-table th:first-child { border-radius: 0 6px 0 0; }
    .items-table td { padding: 10px 12px; border: 1px solid #dee2e6; font-size: 13px; text-align: right; }
    .items-table tr:nth-child(even) td { background: #f8f9fa; }
    .items-table tbody tr:last-child td { border-bottom: 2px solid #1a56db; }
    .totals-section { display: flex; justify-content: flex-start; margin-bottom: 25px; }
    .totals-table   { width: 320px; border-collapse: collapse; border: 2px solid #1a56db; border-radius: 6px; overflow: hidden; }
    .totals-table td { padding: 10px 12px; border-bottom: 1px solid #e9ecef; font-size: 13px; }
    .totals-table .label  { font-weight: 700; text-align: left; background: #f8f9fa; border-right: 1px solid #dee2e6; }
    .totals-table .amount { text-align: right; background: white; }
    .totals-table .grand-total td { background: #1a56db; color: white; font-weight: bold; font-size: 15px; border-bottom: none; }
    .account-summary {
      padding: 16px; margin-bottom: 25px; border: 2px solid #e9ecef; border-radius: 8px; background: #fafafa;
    }
    .account-title { font-weight: bold; font-size: 16px; margin-bottom: 12px; color: #333; }
    .account-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; padding: 4px 0; }
    .account-row.divider { border-top: 1px solid #dee2e6; padding-top: 8px; margin-top: 4px; }
    .account-row.highlight { font-weight: bold; font-size: 15px; }
    .barcode-section { text-align: center; margin: 20px 0; padding: 15px 0; border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; }
    .barcode { font-family: 'Libre Barcode 39','Courier New',monospace; font-size: 36px; letter-spacing: 2px; margin: 8px 0; direction: ltr; }
    .barcode-text { font-size: 10px; color: #666; }
    .notes-section { margin: 20px 0; padding: 15px; border: 1px dashed #ddd; border-radius: 4px; font-size: 13px; }
    .footer { text-align: center; font-size: 11px; margin-top: 30px; padding-top: 15px; border-top: 2px solid #000; color: #555; }
    .footer-line { margin-bottom: 3px; }
    .no-print { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn { padding: 10px 20px; margin: 0 5px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; }
    .print-btn-primary   { background: #1a56db; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    @media screen { body { max-width: 900px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,.1); border-radius: 12px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <img src="/images/logo-light.jpeg" alt="Logo" class="company-logo" />
        <div class="company-name">${companyName}</div>
        <div class="company-details">
          ${companyAddress ? `${companyAddress}<br>` : ''}
          ${companyPhone   ? `${companyPhone}` : ''}
          ${companyEmail   ? ` | ${companyEmail}` : ''}
          ${taxId          ? `<br>${taxId}` : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-type-label">${texts.purchase_invoice}</div>
        <div class="invoice-number">#${purchase.invoiceNumber || ''}</div>
        <div class="invoice-date">${texts.date}: ${purchaseDate}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-section">
        <div class="info-title">${texts.supplier_details}</div>
        <div class="info-row">
          <span class="info-label">${texts.supplier}:</span>
          <span style="font-weight:600;">${supplierName}</span>
        </div>
        ${hasPrev ? `
        <div class="info-row">
          <span class="info-label">${texts.previous_balance}:</span>
          <span style="font-weight:600;color:${prevBal > 0 ? '#d32f2f' : prevBal < 0 ? '#2e7d32' : '#666'}">
            ${formatCurrency(Math.abs(prevBal))} ${prevBal > 0 ? '(Dr)' : prevBal < 0 ? '(Cr)' : ''}
          </span>
        </div>` : ''}
      </div>
      <div class="info-section">
        <div class="info-title">انوائس کی تفصیلات</div>
        <div class="info-row">
          <span class="info-label">${texts.invoice_number}:</span>
          <span>${purchase.invoiceNumber || ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">${texts.date}:</span>
          <span>${purchaseDate}</span>
        </div>
        ${purchase.paymentType ? `
        <div class="info-row">
          <span class="info-label">${texts.payment_type}:</span>
          <span>${purchase.paymentType}</span>
        </div>` : ''}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:40px;text-align:center;">#</th>
          <th>${texts.product_name}</th>
          <th style="width:120px;text-align:center;">${texts.quantity}</th>
          <th style="width:130px;text-align:right;">${texts.unit_price}</th>
          <th style="width:130px;text-align:right;">${texts.total_amount}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any, index: number) => {
          const price     = item.purchasePrice || item.priceAtPurchase || item.unitPrice || 0
          const qty       = item.quantity || 0
          const itemTotal = item.total || price * qty
          const name      = item.product?.name || item.name || ''
          const unit      = item.unit || item.product?.unit || 'pcs'
          return `
          <tr>
            <td style="text-align:center;"><strong>${index + 1}</strong></td>
            <td><strong>${name}</strong></td>
            <td style="text-align:center;">${qty} ${unit}</td>
            <td style="text-align:right;">${formatCurrency(price)}</td>
            <td style="text-align:right;"><strong>${formatCurrency(itemTotal)}</strong></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <table class="totals-table">
        <tr>
          <td class="label">${texts.subtotal}:</td>
          <td class="amount">${formatCurrency(totalAmount)}</td>
        </tr>
        <tr class="grand-total">
          <td class="label">${texts.total}:</td>
          <td class="amount">${formatCurrency(totalAmount)}</td>
        </tr>
      </table>
    </div>

    <div class="account-summary">
      <div class="account-title">${texts.account_summary}</div>
      <div class="account-row">
        <span>${texts.current_purchase}:</span>
        <span style="font-weight:600;">${formatCurrency(totalAmount)}</span>
      </div>
      ${hasPrev ? `
      <div class="account-row">
        <span>${texts.previous_balance}:</span>
        <span style="color:${prevBal > 0 ? '#d32f2f' : '#2e7d32'};font-weight:600;">
          ${formatCurrency(Math.abs(prevBal))} ${prevBal > 0 ? '(Dr)' : '(Cr)'}
        </span>
      </div>
      <div class="account-row divider highlight">
        <span>${texts.total_payable}:</span>
        <span style="color:#d32f2f;">${formatCurrency(totalOwed)}</span>
      </div>` : ''}
      <div class="account-row${hasPrev ? '' : ' divider'}">
        <span>${texts.paid}:</span>
        <span style="color:#2e7d32;font-weight:600;">${formatCurrency(paidAmount)}</span>
      </div>
      <div class="account-row highlight" style="border-top:2px solid #333;margin-top:4px;padding-top:8px;">
        <span>${newBalance > 0 ? texts.balance_due : texts.paid_in_full}:</span>
        <span style="color:${newBalance > 0 ? '#d32f2f' : '#2e7d32'};">
          ${newBalance > 0 ? formatCurrency(newBalance) : '✓ ' + formatCurrency(0)}
        </span>
      </div>
    </div>

    <div class="barcode-section">
      <div style="font-size:12px;margin-bottom:6px;font-weight:bold;">${texts.invoice_barcode}</div>
      <div class="barcode">${generateBarcodeText(purchase.invoiceNumber || '')}</div>
      <div class="barcode-text">${purchase.invoiceNumber || ''} — ${texts.scan_to_verify}</div>
    </div>

    ${purchase.notes ? `
    <div class="notes-section">
      <div style="font-weight:bold;margin-bottom:5px;">${texts.notes}:</div>
      <div>${purchase.notes}</div>
    </div>` : ''}

    <div class="footer">
      <div class="footer-line"><strong>${texts.thank_you}</strong></div>
      <div class="footer-line">${texts.keep_receipt}</div>
      <div class="footer-line">${texts.generated_on}: ${new Date().toLocaleString('ur-PK')}</div>
      <div style="margin-top:8px;font-size:10px;color:#000;font-weight:bold;">${texts.powered_by}</div>
    </div>
  </div>

  <div class="no-print">
    <div style="margin-bottom:10px;font-weight:bold;">${texts.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${texts.print_invoice}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${texts.close}</button>
  </div>
</body>
</html>`.trim()
}
