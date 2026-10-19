import type { ProductionOrder } from '@/stores/manufacturing.api'
import { PRIORITY_META, fmtDate, fmtQty, statusLabel } from './constants'
import { lineIssuedNet, lineRemaining } from './material-math'
import { escapeHtml } from './order-export'
import { formatAppDateTime } from '@/lib/date-format'

const minutes = (m?: number | null) => {
  const v = Math.max(0, Math.round(Number(m) || 0))
  const h = Math.floor(v / 60)
  return h ? `${h}h ${String(v % 60).padStart(2, '0')}m` : `${v}m`
}

/**
 * The shop-floor job card for one order: what to build, the materials to pick, and the
 * routing with a sign-off column per step — printed (or saved as PDF) through the browser's
 * print dialog, like the order list. Returns false when the pop-up was blocked.
 */
export function printJobCard(
  order: ProductionOrder,
  { branchName, t }: { branchName?: string; t: (s: string) => string }
) {
  const e = escapeHtml
  const ops = order.operations || []
  const header: [string, string][] = [
    [t('Product'), `${order.productName}${order.sku ? ` (${order.sku})` : ''}`],
    [t('Quantity'), `${fmtQty(order.plannedQuantity)} ${order.unit}`],
    [t('Batch No.'), order.batchNumber || order.orderNumber],
    [
      t('BOM'),
      order.bomNumber ? `${order.bomNumber} v${order.bomVersion}` : '—',
    ],
    [t('Status'), t(statusLabel(order.status, order.orderType))],
    [t('Priority'), t(PRIORITY_META[order.priority].label)],
    [t('Start date'), fmtDate(order.plannedStartDate)],
    [t('Due date'), fmtDate(order.plannedCompletionDate)],
    [t('Warehouse'), branchName || '—'],
    [
      t('Locations'),
      [order.sourceLocation, order.wipLocation, order.finishedGoodsLocation]
        .map((l) => l || '—')
        .join(' → '),
    ],
    [t('Operator'), order.operatorName || '—'],
    [
      t('Production team'),
      (order.team || []).map((m) => m.name).join(', ') || '—',
    ],
    [
      t('Produced / good'),
      `${fmtQty(order.producedQuantity)} / ${fmtQty(order.completedQuantity)} ${order.unit}`,
    ],
  ]

  const materials = order.materials
    .map(
      (m) => `<tr>
        <td>${e(m.productName)}${m.sku ? `<div class="sub">${e(m.sku)}</div>` : ''}${
          m.isOptional ? `<div class="sub">${e(t('Optional'))}</div>` : ''
        }</td>
        <td class="num">${e(fmtQty(m.requiredQuantity))} ${e(m.unit)}</td>
        <td class="num">${e(fmtQty(lineIssuedNet(m)))}</td>
        <td class="num">${e(fmtQty(lineRemaining(m)))}</td>
        <td class="box"></td>
      </tr>`
    )
    .join('')

  const routing = ops
    .map(
      (op, i) => `<tr>
        <td class="num">${(i + 1) * 10}</td>
        <td><b>${e(op.name)}</b>${op.instructions ? `<div class="sub">${e(op.instructions)}</div>` : ''}</td>
        <td>${e(op.workCenter || '—')}</td>
        <td class="num">${e(minutes(op.plannedMinutes))}</td>
        <td>${
          op.status === 'completed'
            ? `✓ ${e(fmtDate(op.completedAt))}${op.completedByName ? ` · ${e(op.completedByName)}` : ''}`
            : op.status === 'skipped'
              ? e(t('Skipped'))
              : op.status === 'in_progress'
                ? e(t('In progress'))
                : ''
        }</td>
        <td class="num">${op.actualMinutes != null ? e(minutes(op.actualMinutes)) : ''}</td>
        <td class="box"></td>
      </tr>`
    )
    .join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(t('Job card'))} ${e(order.orderNumber)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#0f172a;font-size:11px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px}
  .no{font-family:ui-monospace,monospace;font-size:13px;font-weight:700}
  h1{font-size:20px;margin:2px 0 0}
  .meta{color:#64748b;font-size:10px;text-align:right}
  dl{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin:0 0 14px}
  dt{color:#64748b;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
  dd{margin:1px 0 0;font-weight:500}
  h2{font-size:12px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;text-align:left;padding:6px;border:1px solid #cbd5e1;font-weight:600;font-size:10px}
  td{padding:6px;border:1px solid #e2e8f0;vertical-align:top}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.box{width:90px}
  .sub{color:#64748b;font-size:9.5px;margin-top:1px}
  .qc{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:6px}
  .qc div{border:1px solid #cbd5e1;padding:8px;min-height:44px}
  .qc span{display:block;color:#64748b;font-size:9.5px}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:28px}
  .sign div{border-top:1px solid #0f172a;padding-top:4px;color:#64748b;font-size:9.5px}
  @media print{body{margin:10mm} thead{display:table-header-group} tr{break-inside:avoid}}
</style></head>
<body>
  <div class="top">
    <div>
      <div class="no">${e(order.orderNumber)}</div>
      <h1>${e(order.productName)}</h1>
    </div>
    <div class="meta">${e(t('Job card'))}<br>${e(t('Printed'))} ${e(formatAppDateTime(new Date()))}</div>
  </div>
  <dl>${header.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>
  ${order.notes ? `<p><b>${e(t('Notes'))}:</b> ${e(order.notes)}</p>` : ''}

  <h2>${e(t('Materials'))}</h2>
  ${
    order.materials.length
      ? `<table><thead><tr>
          <th>${e(t('Material'))}</th><th class="num">${e(t('Required'))}</th>
          <th class="num">${e(t('Issued'))}</th><th class="num">${e(t('Remaining'))}</th><th>${e(t('Picked by'))}</th>
        </tr></thead><tbody>${materials}</tbody></table>`
      : `<p>${e(t('This order has no BOM materials.'))}</p>`
  }

  <h2>${e(t('Operations'))}</h2>
  ${
    ops.length
      ? `<table><thead><tr>
          <th class="num">#</th><th>${e(t('Step'))}</th><th>${e(t('Work center'))}</th>
          <th class="num">${e(t('Planned'))}</th><th>${e(t('Done'))}</th><th class="num">${e(t('Worked'))}</th><th>${e(t('Sign-off'))}</th>
        </tr></thead><tbody>${routing}</tbody></table>`
      : `<p>${e(t('No routing on this order.'))}</p>`
  }

  <h2>${e(t('Quality check'))}</h2>
  <div class="qc">
    <div><span>${e(t('Produced'))}</span></div>
    <div><span>${e(t('Good'))}</span></div>
    <div><span>${e(t('Rejected'))}</span></div>
    <div><span>${e(t('Inspector'))}</span></div>
  </div>

  <div class="sign">
    <div>${e(t('Supervisor'))}</div>
    <div>${e(t('Quality'))}</div>
    <div>${e(t('Store (finished goods received)'))}</div>
  </div>
</body></html>`

  const w = window.open(
    '',
    '_blank',
    'width=900,height=800,scrollbars=yes,resizable=yes'
  )
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  return true
}
