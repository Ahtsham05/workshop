import { format } from 'date-fns'
import { escapeHtml } from '@/lib/escape-html'
import { openPrintWindowForFormat, type PrintWindowContact } from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS, withPrintOrientation, type PaperSize, type PrintOrientation } from '@/features/invoice/utils/paper-format'

const FONT_STACK = `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

const SOURCE_TYPE_LABEL: Record<string, string> = {
  customer: 'Customer',
  income: 'Income',
}

export interface PrintableReceiptVoucherLine {
  sourceType: 'customer' | 'income'
  category?: string
  customerName?: string
  payerName: string
  amount: number
  description?: string
}

export interface PrintableReceiptVoucher {
  voucherNumber: string
  date: string
  bankAccountName?: string
  lines: PrintableReceiptVoucherLine[]
  totalAmount: number
  reference?: string
  notes?: string
}

interface PrintCompany {
  name: string
  address?: string
  phone?: string
}

const formatCurrency = (amount: number) => `Rs ${Math.abs(amount).toFixed(2)}`

const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), 'PPP')
  } catch {
    return dateString
  }
}

const generateVoucherHTML = (voucher: PrintableReceiptVoucher, company: PrintCompany, paperSize: PaperSize, orientation: PrintOrientation) => {
  const resolvedFormat = withPrintOrientation(paperSize, orientation)
  const paperFormat = PAPER_FORMATS[resolvedFormat]
  const cardWidth = (paperFormat.bodyWidthPx ?? 380) + (paperFormat.family === 'thermal' ? 80 : 220)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt Voucher ${escapeHtml(voucher.voucherNumber)}</title>
  <style>
    @media print {
      @page {
        margin: ${paperFormat.pageMargin};
        size: ${paperFormat.pageCss};
      }
      body {
        margin: 0;
        padding: 0;
        font-size: ${paperFormat.baseFontPx - 1}px;
      }
      .no-print {
        display: none !important;
      }
    }

    body {
      font-family: ${FONT_STACK};
      font-size: ${paperFormat.baseFontPx}px;
      line-height: 1.45;
      margin: 0;
      padding: 12px 14px;
      max-width: ${cardWidth}px;
      margin-left: auto;
      margin-right: auto;
      background: #fff;
      color: #111827;
      -webkit-font-smoothing: antialiased;
    }

    .voucher-header {
      text-align: center;
      margin-bottom: 14px;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 12px;
    }

    .business-name {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 6px;
      letter-spacing: 0.02em;
      color: #111827;
    }

    .business-info {
      font-size: 11px;
      margin-bottom: 2px;
      color: #4b5563;
      line-height: 1.4;
    }

    .voucher-title {
      font-size: 14px;
      font-weight: 700;
      margin: 10px 0 6px;
      color: #15803d;
      letter-spacing: 0.04em;
    }

    .voucher-info {
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px dashed #d1d5db;
    }

    .info-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
      gap: 10px 16px;
      align-items: baseline;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .info-label {
      font-weight: 600;
      color: #374151;
    }

    .info-row span:last-child {
      font-variant-numeric: tabular-nums;
      color: #111827;
      word-break: break-word;
    }

    .description-section {
      margin-bottom: 14px;
      padding: 10px 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }

    .lines-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 11px;
    }

    .lines-table th {
      text-align: left;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 6px 8px;
      font-weight: 600;
      color: #374151;
    }

    .lines-table td {
      border: 1px solid #e5e7eb;
      padding: 6px 8px;
      vertical-align: top;
      word-break: break-word;
    }

    .lines-table td.amount-col,
    .lines-table th.amount-col {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .lines-table tfoot td {
      font-weight: 700;
      background: #f0fdf4;
      color: #15803d;
    }

    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 22px;
      margin-bottom: 14px;
    }

    .signature-line {
      border-top: 1px solid #374151;
      padding-top: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 10px;
      color: #374151;
    }

    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 14px;
      border-top: 1px solid #d1d5db;
      padding-top: 10px;
      color: #6b7280;
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

    .print-btn-primary { background: #15803d; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }

    @media screen {
      body {
        max-width: ${cardWidth}px;
        margin: 24px auto;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
        padding: 20px 22px;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
      }
    }
  </style>
</head>
<body>
  <div class="voucher-header">
    <div class="business-name">${escapeHtml(company.name)}</div>
    ${company.address ? `<div class="business-info">${escapeHtml(company.address)}</div>` : ''}
    ${company.phone ? `<div class="business-info">${escapeHtml(company.phone)}</div>` : ''}
    <div class="voucher-title">RECEIPT VOUCHER</div>
    <div class="business-info">Voucher #: ${escapeHtml(voucher.voucherNumber)}</div>
  </div>

  <div class="voucher-info">
    <div class="info-row">
      <span class="info-label">Date:</span>
      <span>${formatDate(voucher.date)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Received Into:</span>
      <span>${escapeHtml(voucher.bankAccountName || '-')}</span>
    </div>
    ${voucher.reference ? `
    <div class="info-row">
      <span class="info-label">Reference:</span>
      <span>${escapeHtml(voucher.reference)}</span>
    </div>
    ` : ''}
  </div>

  ${voucher.notes ? `
  <div class="description-section">
    <div class="info-label">Notes:</div>
    <div style="margin-top: 3px; font-size: 11px;">${escapeHtml(voucher.notes)}</div>
  </div>
  ` : ''}

  <table class="lines-table">
    <thead>
      <tr>
        <th>Received From</th>
        <th>Type</th>
        <th>Description</th>
        <th class="amount-col">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${voucher.lines
        .map(
          (line) => `
      <tr>
        <td>${escapeHtml(line.payerName)}</td>
        <td>${escapeHtml(SOURCE_TYPE_LABEL[line.sourceType] || line.sourceType)}</td>
        <td>${escapeHtml(line.description || '-')}</td>
        <td class="amount-col">${formatCurrency(line.amount)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Total Amount Received</td>
        <td class="amount-col">${formatCurrency(voucher.totalAmount)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="signature-section">
    <div class="signature-line">Received By</div>
    <div class="signature-line">Authorized By</div>
  </div>

  <div class="footer">
    <div>Computer generated voucher</div>
  </div>

  <div class="no-print">
    <button onclick="window.print()" class="print-btn print-btn-primary">🖨️ Print Voucher</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">✕ Close</button>
  </div>
</body>
</html>
  `.trim()
}

export const printReceiptVoucher = (
  voucher: PrintableReceiptVoucher,
  company: PrintCompany,
  paperSize: PaperSize,
  orientation: PrintOrientation,
  contact?: PrintWindowContact,
) => {
  const resolvedFormat = withPrintOrientation(paperSize, orientation)
  const html = generateVoucherHTML(voucher, company, paperSize, orientation)
  openPrintWindowForFormat(html, resolvedFormat, contact)
}
