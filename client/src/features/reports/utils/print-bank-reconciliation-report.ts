import { format } from 'date-fns'
import { escapeHtml } from '@/lib/escape-html'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS } from '@/features/invoice/utils/paper-format'
import type { BankReconciliationSessionEntry, BankReconciliationSessionRow } from '@/stores/reports.api'

const FONT_STACK = `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

interface PrintCompany {
  name: string
  address?: string
  phone?: string
}

const fmt = (amount: number) => `Rs ${Math.abs(amount).toFixed(2)}`

const fmtDate = (value: string | null) => {
  if (!value) return '-'
  try {
    return format(new Date(value), 'PPP')
  } catch {
    return value
  }
}

const generateReportHTML = (
  session: BankReconciliationSessionRow,
  entries: BankReconciliationSessionEntry[],
  company: PrintCompany,
) => {
  const paperFormat = PAPER_FORMATS.a4
  const isBalanced = Math.abs(session.difference) < 0.01

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bank Reconciliation Report - ${escapeHtml(session.bankAccountName)}</title>
  <style>
    @media print {
      @page {
        margin: ${paperFormat.pageMargin};
        size: ${paperFormat.pageCss};
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
      font-family: ${FONT_STACK};
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
      padding: 24px 28px;
      background: #fff;
      color: #111827;
      -webkit-font-smoothing: antialiased;
    }

    .report-header {
      text-align: center;
      margin-bottom: 18px;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 14px;
    }

    .business-name {
      font-size: 18px;
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

    .report-title {
      font-size: 16px;
      font-weight: 700;
      margin: 12px 0 4px;
      color: #1e3a8a;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 32px;
      margin: 16px 0;
      padding: 14px 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .info-label {
      font-weight: 600;
      color: #374151;
    }

    .info-value {
      font-variant-numeric: tabular-nums;
      color: #111827;
      text-align: right;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 18px 0;
    }

    .summary-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      text-align: center;
    }

    .summary-card .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .summary-card .value {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #111827;
    }

    .summary-card.status {
      background: ${isBalanced ? '#ecfdf5' : '#fef2f2'};
      border-color: ${isBalanced ? '#a7f3d0' : '#fecaca'};
    }

    .summary-card.status .value {
      color: ${isBalanced ? '#059669' : '#b91c1c'};
    }

    .lines-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 11px;
    }

    .lines-table th {
      text-align: left;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 7px 9px;
      font-weight: 600;
      color: #374151;
    }

    .lines-table td {
      border: 1px solid #e5e7eb;
      padding: 6px 9px;
      vertical-align: top;
      word-break: break-word;
    }

    .lines-table td.amount-col,
    .lines-table th.amount-col {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
    }

    .badge.in { background: #ecfdf5; color: #059669; }
    .badge.out { background: #fef2f2; color: #b91c1c; }

    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 40px;
    }

    .signature-line {
      border-top: 1px solid #374151;
      padding-top: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 11px;
      color: #374151;
    }

    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 20px;
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

    .print-btn-primary { background: #1e3a8a; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }

    @media screen {
      body {
        max-width: 820px;
        margin: 24px auto;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
        padding: 28px 32px;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
      }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="business-name">${escapeHtml(company.name)}</div>
    ${company.address ? `<div class="business-info">${escapeHtml(company.address)}</div>` : ''}
    ${company.phone ? `<div class="business-info">${escapeHtml(company.phone)}</div>` : ''}
    <div class="report-title">Bank Reconciliation Report</div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="info-label">Bank Account</span><span class="info-value">${escapeHtml(session.bankAccountName)}</span></div>
    <div class="info-row"><span class="info-label">Statement Period</span><span class="info-value">${fmtDate(session.statementStartDate)} – ${fmtDate(session.statementEndDate)}</span></div>
    <div class="info-row"><span class="info-label">Prepared By</span><span class="info-value">${escapeHtml(session.createdBy?.name || '-')}</span></div>
    <div class="info-row"><span class="info-label">Report Date</span><span class="info-value">${fmtDate(session.createdAt)}</span></div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Statement Balance</div>
      <div class="value">${fmt(session.statementClosingBalance)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Book Balance</div>
      <div class="value">${fmt(session.bookClosingBalance)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Matched Entries</div>
      <div class="value">${session.matchedCount}</div>
    </div>
    <div class="summary-card status">
      <div class="label">${isBalanced ? 'Status' : 'Difference'}</div>
      <div class="value">${isBalanced ? 'Balanced' : fmt(session.difference)}</div>
    </div>
  </div>

  <table class="lines-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Description</th>
        <th>Source</th>
        <th class="amount-col">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${entries
        .map(
          (entry) => `
      <tr>
        <td>${fmtDate(entry.date)}</td>
        <td><span class="badge ${entry.type}">${entry.type === 'in' ? 'Money In' : 'Money Out'}</span></td>
        <td>${escapeHtml(entry.description || '-')}</td>
        <td>${escapeHtml(entry.referenceModel || '-')}</td>
        <td class="amount-col">${fmt(entry.amount)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="signature-section">
    <div class="signature-line">Prepared By</div>
    <div class="signature-line">Verified By</div>
  </div>

  <div class="footer">
    <div>Computer generated report</div>
  </div>

  <div class="no-print">
    <button onclick="window.print()" class="print-btn print-btn-primary">🖨️ Print Report</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">✕ Close</button>
  </div>
</body>
</html>
  `.trim()
}

export const printBankReconciliationReport = (
  session: BankReconciliationSessionRow,
  entries: BankReconciliationSessionEntry[],
  company: PrintCompany,
) => {
  const html = generateReportHTML(session, entries, company)
  openPrintWindowForFormat(html, 'a4')
}
