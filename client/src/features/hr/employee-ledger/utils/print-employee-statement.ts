import { escapeHtml } from '@/lib/escape-html'
import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import type { CurrencyOption } from '@/stores/localization.api'
import type { EmployeeStatement } from '@/stores/hr.api'
import { accountOf, balanceSide, BALANCE_SIDE_LABEL, rowTypeLabel } from './employee-ledger'

interface PrintCompany {
  name: string
  address?: string
  phone?: string
  currencyMeta?: CurrencyOption
}

const FONT_STACK = `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

const safeDate = (value?: string | null) => {
  if (!value) return ''
  try {
    return formatAppDate(new Date(value))
  } catch {
    return String(value)
  }
}

/** A4 account statement for one employee: opening, every entry with its running balance, closing. */
export function printEmployeeStatement(statement: EmployeeStatement, company: PrintCompany, periodLabel: string) {
  const money = (n: number) => formatMoneyWithMeta(Math.abs(Number(n) || 0), company.currencyMeta ?? FALLBACK_CURRENCY)
  const balance = (n: number) => {
    const side = balanceSide(n)
    return side === 'settled' ? 'Settled' : `${money(n)} <span class="side ${side}">${BALANCE_SIDE_LABEL[side]}</span>`
  }
  const { employee } = statement
  const rows = statement.rows
    .map(
      (row) => `
      <tr${row.memo ? ' class="memo"' : ''}>
        <td class="nowrap">${escapeHtml(safeDate(row.transactionDate))}</td>
        <td>${escapeHtml(rowTypeLabel(row))}${row.memo ? '<div class="sub">memo — balance unchanged</div>' : ''}</td>
        <td>${escapeHtml(row.description || '')}${row.notes && !row.description?.includes(row.notes) ? `<div class="sub">${escapeHtml(row.notes)}</div>` : ''}</td>
        <td class="nowrap">${escapeHtml(row.reference || '')}${accountOf(row) ? `<div class="sub">${escapeHtml(accountOf(row))}</div>` : ''}</td>
        <td class="num">${row.debit ? money(row.debit) : ''}</td>
        <td class="num">${row.credit ? money(row.credit) : ''}</td>
        <td class="num nowrap">${balance(row.runningBalance)}</td>
      </tr>`
    )
    .join('')

  const s = statement.summary
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Employee Statement — ${escapeHtml(employee.name)}</title>
<style>
  @media print { @page { size: A4; margin: 12mm; } .no-print { display: none !important; } body { padding: 0; } }
  body { font-family: ${FONT_STACK}; font-size: 11px; color: #111827; margin: 0 auto; padding: 16px; max-width: 900px; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; gap: 16px; }
  .biz { font-size: 16px; font-weight: 700; }
  .muted { color: #6b7280; }
  .title { font-size: 14px; font-weight: 700; letter-spacing: .04em; text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; margin-bottom: 12px; }
  .grid div span { color: #6b7280; display: inline-block; min-width: 92px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .card { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
  .card .l { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  .card .v { font-size: 12px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 6px; border-bottom: 1px solid #9ca3af; }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }
  .sub { font-size: 9px; color: #6b7280; }
  tr.memo td { color: #6b7280; font-style: italic; }
  tr.opening td, tfoot td { font-weight: 700; background: #f9fafb; }
  .side { font-size: 9px; font-weight: 600; padding: 0 4px; border-radius: 3px; }
  .side.payable { background: #fef3c7; color: #92400e; }
  .side.advance { background: #e0f2fe; color: #075985; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; }
  .sign div { border-top: 1px solid #111827; width: 200px; text-align: center; padding-top: 4px; }
  .foot { margin-top: 18px; text-align: center; font-size: 9px; color: #9ca3af; }
  .no-print { text-align: center; margin-top: 16px; }
  .no-print button { padding: 8px 16px; margin: 0 4px; border-radius: 6px; border: 1px solid #d1d5db; background: #111827; color: #fff; cursor: pointer; }
  .no-print button.secondary { background: #fff; color: #111827; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="biz">${escapeHtml(company.name)}</div>
      ${company.address ? `<div class="muted">${escapeHtml(company.address)}</div>` : ''}
      ${company.phone ? `<div class="muted">${escapeHtml(company.phone)}</div>` : ''}
    </div>
    <div>
      <div class="title">EMPLOYEE ACCOUNT STATEMENT</div>
      <div class="muted" style="text-align:right">${escapeHtml(periodLabel)}</div>
    </div>
  </div>

  <div class="grid">
    <div><span>Employee</span> <b>${escapeHtml(employee.name)}</b></div>
    <div><span>Employee ID</span> ${escapeHtml(employee.employeeId || '-')}</div>
    <div><span>Position</span> ${escapeHtml([employee.designation, employee.department].filter(Boolean).join(' · ') || '-')}</div>
    <div><span>Status</span> ${escapeHtml(employee.employmentStatus || '-')}</div>
    ${employee.monthlySalary ? `<div><span>Monthly salary</span> ${money(employee.monthlySalary)}</div>` : ''}
    ${employee.phone ? `<div><span>Phone</span> ${escapeHtml(employee.phone)}</div>` : ''}
  </div>

  <div class="cards">
    <div class="card"><div class="l">Opening balance</div><div class="v">${balance(statement.openingBalance)}</div></div>
    <div class="card"><div class="l">Earned / received</div><div class="v">${money(statement.totals.debit)}</div></div>
    <div class="card"><div class="l">Paid / advanced</div><div class="v">${money(statement.totals.credit)}</div></div>
    <div class="card"><div class="l">Closing balance</div><div class="v">${balance(statement.closingBalance)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th><th>Type</th><th>Particulars</th><th>Ref / Account</th>
        <th class="num">Earned / Received</th><th class="num">Paid / Advanced</th><th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening"><td colspan="6">Opening balance</td><td class="num nowrap">${balance(statement.openingBalance)}</td></tr>
      ${rows || '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">No entries in this period</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">Period totals · closing balance</td>
        <td class="num">${money(statement.totals.debit)}</td>
        <td class="num">${money(statement.totals.credit)}</td>
        <td class="num nowrap">${balance(statement.closingBalance)}</td>
      </tr>
    </tfoot>
  </table>

  <p class="muted" style="margin-top:10px">
    All time: salary earned ${money(s.totalPayable)} · salary paid ${money(s.totalSalaryPaid)} · advances given ${money(s.totalAdvancePaid)}
    · cash received back ${money(s.totalCashReceived)} · advance outstanding ${money(s.outstandingAdvance)}.
  </p>

  <div class="sign"><div>Prepared by</div><div>Employee signature</div></div>
  <div class="foot">Computer generated statement · printed ${escapeHtml(safeDate(new Date().toISOString()))}</div>
  <div class="no-print">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
</body>
</html>`
  openPrintWindowForFormat(html, 'a4')
}
