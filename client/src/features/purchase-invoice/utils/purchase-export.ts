import { format } from 'date-fns'
import type { PurchaseExportRow } from '@/stores/purchase.api'
import { SETTLEMENT_STATUS_META, DUE_STATUS_META, type DueStatus, type SettlementStatus } from './purchase-settlement'

const EXPORT_COLUMNS: { header: string; value: (row: PurchaseExportRow) => string | number }[] = [
  { header: 'Invoice #', value: (row) => row.invoiceNumber || '' },
  { header: 'Vendor Bill #', value: (row) => row.vendorBillNumber || '' },
  { header: 'Supplier', value: (row) => row.supplierName || '' },
  { header: 'Items', value: (row) => row.itemsCount ?? 0 },
  { header: 'Purchase Date', value: (row) => (row.purchaseDate ? format(new Date(row.purchaseDate), 'yyyy-MM-dd') : '') },
  { header: 'Due Date', value: (row) => (row.dueDate ? format(new Date(row.dueDate), 'yyyy-MM-dd') : '') },
  { header: 'Payment Type', value: (row) => (row.type === 'credit' ? 'Credit' : row.paymentType || 'Cash') },
  { header: 'Invoice Total', value: (row) => Number(row.totalAmount || 0).toFixed(2) },
  { header: 'Paid', value: (row) => Number(row.settledAmount || 0).toFixed(2) },
  { header: 'Remaining', value: (row) => Number(row.remainingAmount || 0).toFixed(2) },
  { header: 'Status', value: (row) => SETTLEMENT_STATUS_META[row.settlementStatus as SettlementStatus]?.label || row.settlementStatus || '' },
  { header: 'Due Status', value: (row) => DUE_STATUS_META[row.dueStatus as DueStatus]?.label || row.dueStatus || '' },
  { header: 'Created By', value: (row) => row.createdByName || '' },
  { header: 'Last Updated', value: (row) => (row.updatedAt ? format(new Date(row.updatedAt), 'yyyy-MM-dd HH:mm') : '') },
  { header: 'Notes', value: (row) => row.notes || '' },
]

/** RFC-4180 quoting: a value containing a comma, quote or newline has to be wrapped. */
const csvCell = (value: string | number) => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const timestampedName = (extension: string) => `purchases-${format(new Date(), 'yyyy-MM-dd-HHmm')}.${extension}`

export function exportPurchasesToCsv(rows: PurchaseExportRow[]) {
  const csv = [
    EXPORT_COLUMNS.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(column.value(row))).join(',')),
  ].join('\n')

  // A UTF-8 BOM so Excel reads the file as UTF-8 — Urdu supplier names otherwise arrive as mojibake.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = timestampedName('csv')
  link.click()
  URL.revokeObjectURL(link.href)
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] as string))

/**
 * PDF export goes through the browser's own print-to-PDF, same approach every other print
 * path in this app uses (purchasePrintUtils, receipt/voucher printing) — no PDF library is
 * bundled, and the print dialog gives the user page size and orientation for free.
 */
export function exportPurchasesToPdf(
  rows: PurchaseExportRow[],
  meta: { title?: string; subtitle?: string; formatMoney: (amount: number) => string }
) {
  const totals = rows.reduce(
    (accumulator, row) => ({
      total: accumulator.total + Number(row.totalAmount || 0),
      paid: accumulator.paid + Number(row.settledAmount || 0),
      remaining: accumulator.remaining + Number(row.remainingAmount || 0),
    }),
    { total: 0, paid: 0, remaining: 0 }
  )

  const body = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.invoiceNumber)}</td>
        <td>${escapeHtml(row.vendorBillNumber || '—')}</td>
        <td>${escapeHtml(row.supplierName || '—')}</td>
        <td>${escapeHtml(row.purchaseDate ? format(new Date(row.purchaseDate), 'dd MMM yyyy') : '—')}</td>
        <td>${escapeHtml(row.dueDate ? format(new Date(row.dueDate), 'dd MMM yyyy') : '—')}</td>
        <td class="num">${escapeHtml(meta.formatMoney(Number(row.totalAmount || 0)))}</td>
        <td class="num">${escapeHtml(meta.formatMoney(Number(row.settledAmount || 0)))}</td>
        <td class="num">${escapeHtml(meta.formatMoney(Number(row.remainingAmount || 0)))}</td>
        <td>${escapeHtml(SETTLEMENT_STATUS_META[row.settlementStatus as SettlementStatus]?.label || row.settlementStatus)}</td>
      </tr>`
    )
    .join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(meta.title || 'Purchase Report')}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#0f172a}
  h1{font-size:20px;margin:0 0 4px}
  .subtitle{color:#64748b;font-size:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;font-weight:600}
  td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#f8fafc;border-top:2px solid #cbd5e1}
  @media print{body{margin:10mm} thead{display:table-header-group}}
</style></head>
<body>
  <h1>${escapeHtml(meta.title || 'Purchase Report')}</h1>
  <div class="subtitle">${escapeHtml(meta.subtitle || '')} · ${rows.length} record(s) · generated ${format(new Date(), 'dd MMM yyyy HH:mm')}</div>
  <table>
    <thead><tr>
      <th>Invoice</th><th>Vendor Bill</th><th>Supplier</th><th>Date</th><th>Due</th>
      <th class="num">Total</th><th class="num">Paid</th><th class="num">Remaining</th><th>Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      <td colspan="5">Totals</td>
      <td class="num">${escapeHtml(meta.formatMoney(totals.total))}</td>
      <td class="num">${escapeHtml(meta.formatMoney(totals.paid))}</td>
      <td class="num">${escapeHtml(meta.formatMoney(totals.remaining))}</td>
      <td></td>
    </tr></tfoot>
  </table>
</body></html>`

  const printWindow = window.open('', '_blank', 'width=1100,height=800,scrollbars=yes,resizable=yes')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}
