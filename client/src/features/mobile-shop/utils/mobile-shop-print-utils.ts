import {
  generateBarcodeText,
  openPrintWindow,
} from '@/features/invoice/utils/print-utils'
import { escapeHtml, invoiceNoteToSafeHtml } from '@/lib/escape-html'
import type { Organization } from '@/stores/organization.api'
import type { MobileReceiptData } from '@/features/mobile-shop/components/mobile-shop-receipt'

export type MobileShopReceiptPrintPayload = MobileReceiptData & {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLogo?: string
  taxNumber?: string
  isTrial?: boolean
  invoiceNote?: string
}

/**
 * Thermal receipt HTML aligned with {@link generateInvoiceHTML} (invoice print-utils): fonts, header, borders, barcode, footer.
 */
export function generateMobileShopReceiptHTML(data: MobileShopReceiptPrintPayload): string {
  const {
    title,
    subtitle,
    reference,
    issuedAt,
    lines,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyLogo,
    taxNumber,
    isTrial,
    invoiceNote,
  } = data

  const businessName = companyName || 'Receipt'
  const addr = companyAddress?.trim()
  const phone = companyPhone?.trim()
  const email = companyEmail?.trim()
  const tax = taxNumber?.trim()

  const printLines = lines.filter((row) => {
    if (row.previewOnly) return false
    const value = row.value.trim()
    if (!value || value === '—' || value.toUpperCase() === 'N/A') return false
    return true
  })

  const linesHtml = printLines
    .map(
      (row) => `
    <div class="info-row">
      <span class="info-label">${escapeHtml(row.label)}</span>
      <span class="info-value">${escapeHtml(row.value)}</span>
    </div>`,
    )
    .join('')

  const barcodeKey = (reference || 'RCP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 28) || 'RCP'
  const barcodeDisplay = escapeHtml(reference || barcodeKey)

  return `
<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — ${escapeHtml(reference || '')}</title>
  <style>
    @media print {
      @page {
        margin: 5mm;
        size: 80mm auto;
      }
      body {
        margin: 0;
        padding: 0;
        font-size: 13px;
      }
      .no-print {
        display: none !important;
      }
    }

    body {
      font-family: 'Inter', 'Manrope', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
      padding: 10px 12px;
      width: 300px;
      max-width: 100%;
      background: #fff;
      color: #111;
      text-align: left;
    }

    .receipt-header {
      text-align: center;
      margin-bottom: 14px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }

    .company-logo {
      max-width: 120px;
      height: auto;
      margin: 0 auto 10px;
      display: block;
    }

    .business-name {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .business-info {
      font-size: 10px;
      color: #333;
      margin-bottom: 3px;
      line-height: 1.35;
    }

    .doc-title-wrap {
      text-align: center;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px dashed #000;
    }

    .doc-title {
      font-size: 14px;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
      margin-bottom: 4px;
    }

    .doc-subtitle {
      font-size: 11px;
      color: #444;
      margin-top: 2px;
    }

    .invoice-info {
      margin-bottom: 12px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 5px;
      font-size: 12px;
      border-bottom: 1px dotted #e5e5e5;
      padding-bottom: 5px;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      font-weight: 700;
      color: #000;
      flex: 0 0 42%;
      min-width: 0;
    }

    .info-value {
      flex: 1;
      text-align: right;
      word-break: break-word;
      font-weight: 500;
      color: #111;
    }

    .highlight {
      background: #fffacd;
      padding: 1px 4px;
      border-radius: 2px;
    }

    .lines-section {
      margin-bottom: 12px;
    }

    .lines-heading {
      font-size: 11px;
      font-weight: 700;
      border-bottom: 1px solid #000;
      padding-bottom: 4px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .barcode-section {
      text-align: center;
      margin: 14px 0;
      padding: 10px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }

    .barcode {
      font-family: 'Libre Barcode 39', 'Courier New', monospace;
      font-size: 22px;
      letter-spacing: 1px;
      margin: 8px 0;
      font-weight: normal;
      direction: ltr;
    }

    .barcode-text {
      font-size: 9px;
      margin-top: 4px;
      font-family: ui-monospace, monospace;
    }

    .footer {
      text-align: center;
      font-size: 9px;
      margin-top: 14px;
      border-top: 2px solid #000;
      padding-top: 10px;
      color: #333;
    }

    .footer-line {
      margin-bottom: 3px;
    }

    .invoice-branch-note {
      margin: 10px 0 0;
      padding: 8px 4px 0;
      border-top: 1px dashed #666;
      font-size: 10px;
      text-align: center;
      line-height: 1.35;
      white-space: normal;
      word-break: break-word;
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

    @media screen {
      body {
        max-width: 360px;
        margin: 16px auto;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e8e8e8;
      }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Libre+Barcode+39&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(businessName)}" class="company-logo" />` : isTrial ? `<img src="/images/logo-light.png" alt="Logo" class="company-logo" />` : ''}
    <div class="business-name">${escapeHtml(businessName)}</div>
    ${addr ? `<div class="business-info">${escapeHtml(addr)}</div>` : ''}
    ${phone || email ? `<div class="business-info">${phone ? escapeHtml(phone) : ''}${phone && email ? ' · ' : ''}${email ? escapeHtml(email) : ''}</div>` : ''}
    ${tax ? `<div class="business-info">NTN / STRN: ${escapeHtml(tax)}</div>` : ''}
  </div>

  <div class="doc-title-wrap">
    <div class="doc-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="doc-subtitle">${escapeHtml(subtitle)}</div>` : ''}
  </div>

  ${reference || issuedAt ? `
  <div class="invoice-info">
    ${reference ? `<div class="info-row"><span class="info-label">Reference</span><span class="info-value highlight">${escapeHtml(reference)}</span></div>` : ''}
    ${issuedAt ? `<div class="info-row"><span class="info-label">Date &amp; time</span><span class="info-value">${escapeHtml(issuedAt)}</span></div>` : ''}
  </div>
  ` : ''}

  <div class="lines-section">
    <div class="lines-heading">Details</div>
    ${linesHtml}
  </div>

  ${reference ? `
  <div class="barcode-section">
    <div style="font-size: 10px; margin-bottom: 4px;">Scan / reference</div>
    <div class="barcode">${generateBarcodeText(barcodeKey)}</div>
    <div class="barcode-text">${barcodeDisplay}</div>
  </div>
  ` : ''}

  ${invoiceNote?.trim() ? `<div class="invoice-branch-note">${invoiceNoteToSafeHtml(invoiceNote)}</div>` : ''}

  <div class="footer">
    <div class="footer-line"><strong>Thank you</strong></div>
    <div class="footer-line">Please retain this receipt for your records.</div>
    <div class="footer-line" style="margin-top: 8px; font-weight: 600;">Powered by Logix Plus Solutions</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">Print options</div>
    <button type="button" onclick="window.print()" class="print-btn print-btn-primary">Print receipt</button>
    <button type="button" onclick="window.close()" class="print-btn print-btn-secondary">Close</button>
  </div>
</body>
</html>
  `.trim()
}

/** Opens the invoice-style print window (same flow as sales invoice receipt). */
export function printMobileShopReceipt(
  receipt: MobileReceiptData,
  organization?: Organization | null,
  invoiceNote?: string | null,
): void {
  const html = generateMobileShopReceiptHTML({
    ...receipt,
    companyName: organization?.name,
    companyAddress: [organization?.address, organization?.city, organization?.country].filter(Boolean).join(', '),
    companyPhone: organization?.phone,
    companyEmail: organization?.email,
    companyLogo: organization?.logo?.url,
    taxNumber: organization?.taxNumber,
    isTrial: organization?.subscription?.isTrial,
    invoiceNote: invoiceNote ?? undefined,
  })
  openPrintWindow(html)
}
