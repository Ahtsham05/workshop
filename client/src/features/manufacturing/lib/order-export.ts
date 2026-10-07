import type { OrderExportRow } from '@/stores/manufacturing.api'
import { PRIORITY_META, statusLabel } from './constants'

/*
 * Production order export, following the invoice list's approach: CSV is a download with a
 * UTF-8 BOM (so Excel keeps Urdu names intact); PDF and Print go through the browser's
 * own print dialog, which gives page size and orientation for free.
 */

const day = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : ''
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const COLUMNS: {
  header: string
  value: (r: OrderExportRow) => string | number
}[] = [
  { header: 'Order', value: (r) => r.orderNumber },
  {
    header: 'Type',
    value: (r) => (r.orderType === 'assembly' ? 'Assembly' : 'Production'),
  },
  { header: 'Product', value: (r) => r.productName },
  { header: 'SKU', value: (r) => r.sku },
  { header: 'BOM', value: (r) => r.bom },
  { header: 'Status', value: (r) => statusLabel(r.status, r.orderType) },
  {
    header: 'Priority',
    value: (r) => PRIORITY_META[r.priority]?.label || r.priority,
  },
  { header: 'Planned qty', value: (r) => r.plannedQuantity },
  { header: 'Good qty', value: (r) => r.completedQuantity },
  { header: 'Rejected qty', value: (r) => r.rejectedQuantity },
  { header: 'Unit', value: (r) => r.unit },
  { header: 'Completion %', value: (r) => r.completionPercent },
  { header: 'Production date', value: (r) => day(r.plannedStartDate) },
  { header: 'Due date', value: (r) => day(r.plannedCompletionDate) },
  { header: 'Completed on', value: (r) => day(r.actualCompletionDate) },
  { header: 'Delayed', value: (r) => (r.isDelayed ? 'Yes' : '') },
  { header: 'Shortage', value: (r) => (r.hasShortage ? 'Yes' : '') },
  { header: 'Work center', value: (r) => r.workCenter },
  { header: 'Warehouse', value: (r) => r.warehouse },
  { header: 'Branch', value: (r) => r.branch },
  { header: 'Operator', value: (r) => r.operator },
  { header: 'Created by', value: (r) => r.createdBy },
  {
    header: 'Material cost',
    value: (r) => Number(r.materialCost || 0).toFixed(2),
  },
  { header: 'Created', value: (r) => day(r.createdAt) },
]

const csvCell = (value: string | number) => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportOrdersCsv(
  rows: OrderExportRow[],
  name = 'production-orders'
) {
  const csv = [
    COLUMNS.map((c) => csvCell(c.header)).join(','),
    ...rows.map((r) => COLUMNS.map((c) => csvCell(c.value(r))).join(',')),
  ].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${name}-${stamp()}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
  )

/**
 * Printable list (also "Save as PDF"): the filters in force, one row per order and totals.
 * Returns false when the browser blocked the print window.
 */
export function printOrders(
  rows: OrderExportRow[],
  meta: {
    title: string
    filtersLine: string
    formatMoney: (n: number) => string
    truncated?: boolean
    totalResults?: number
  }
) {
  const totals = rows.reduce(
    (acc, r) => ({
      planned: acc.planned + Number(r.plannedQuantity || 0),
      good: acc.good + Number(r.completedQuantity || 0),
      cost: acc.cost + Number(r.materialCost || 0),
    }),
    { planned: 0, good: 0, cost: 0 }
  )
  const body = rows
    .map(
      (r) => `<tr${r.isDelayed ? ' class="late"' : ''}>
        <td>${escapeHtml(r.orderNumber)}</td>
        <td>${escapeHtml(r.productName)}<div class="sub">${escapeHtml(r.bom)}</div></td>
        <td>${escapeHtml(statusLabel(r.status, r.orderType))}</td>
        <td>${escapeHtml(PRIORITY_META[r.priority]?.label || r.priority)}</td>
        <td class="num">${escapeHtml(r.completedQuantity)} / ${escapeHtml(r.plannedQuantity)} ${escapeHtml(r.unit)}</td>
        <td class="num">${escapeHtml(r.completionPercent)}%</td>
        <td>${escapeHtml(day(r.plannedStartDate))}</td>
        <td>${escapeHtml(day(r.plannedCompletionDate))}${r.isDelayed ? ' <b>late</b>' : ''}</td>
        <td>${escapeHtml(r.workCenter)}</td>
        <td>${escapeHtml(r.operator)}</td>
        <td class="num">${escapeHtml(meta.formatMoney(Number(r.materialCost || 0)))}</td>
      </tr>`
    )
    .join('')
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#0f172a}
  h1{font-size:18px;margin:0 0 4px}
  .meta{color:#64748b;font-size:11px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  th{background:#f1f5f9;text-align:left;padding:7px;border-bottom:1px solid #cbd5e1;font-weight:600}
  td{padding:6px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .sub{color:#64748b;font-size:9.5px}
  tr.late b{color:#b91c1c;font-weight:600}
  tfoot td{font-weight:700;background:#f8fafc;border-top:2px solid #cbd5e1}
  @media print{body{margin:10mm} thead{display:table-header-group} tr{break-inside:avoid}}
</style></head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="meta">${escapeHtml(meta.filtersLine)} · ${rows.length} order(s)${
    meta.truncated
      ? ` of ${meta.totalResults} (narrow the filters to print the rest)`
      : ''
  } · printed ${escapeHtml(new Date().toLocaleString())}</div>
  <table>
    <thead><tr>
      <th>Order</th><th>Product / BOM</th><th>Status</th><th>Priority</th>
      <th class="num">Good / planned</th><th class="num">Done</th>
      <th>Production</th><th>Due</th><th>Work center</th><th>Operator</th><th class="num">Cost</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      <td colspan="4">Totals</td>
      <td class="num">${escapeHtml(totals.good)} / ${escapeHtml(totals.planned)}</td>
      <td colspan="5"></td>
      <td class="num">${escapeHtml(meta.formatMoney(totals.cost))}</td>
    </tr></tfoot>
  </table>
</body></html>`
  const w = window.open(
    '',
    '_blank',
    'width=1100,height=800,scrollbars=yes,resizable=yes'
  )
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  return true
}
