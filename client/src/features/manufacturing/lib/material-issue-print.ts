import type { MaterialIssue } from '@/stores/manufacturing.api'
import { fmtDate, fmtQty } from './constants'
import { escapeHtml } from './order-export'

/**
 * Printable MIV (print / save as PDF through the browser's dialog, like the RMV and job
 * card). Returns false when the pop-up was blocked.
 */
export function printMaterialIssue(
  v: MaterialIssue,
  {
    branchName,
    formatMoney,
    t,
    hideMoney = false,
  }: {
    branchName?: string
    formatMoney: (n: number) => string
    t: (s: string) => string
    /** Quantities only (role without viewManufacturingCosts). */
    hideMoney?: boolean
  }
) {
  const money = (html: string) => (hideMoney ? '' : html)
  const e = escapeHtml
  const head: [string, string][] = [
    [t('Voucher'), v.issueNumber],
    [t('Date'), fmtDate(v.issueDate)],
    [t('Production order'), v.orderNumber || '—'],
    [t('Source warehouse'), v.sourceLocation || '—'],
    [t('WIP location'), v.wipLocation || '—'],
    [t('Branch'), branchName || '—'],
    [t('Requested by'), v.requestedBy?.name || '—'],
    [t('Issued by'), v.issuedBy?.name || '—'],
    [t('Reference'), v.reference || '—'],
  ]
  const rows = v.lines
    .map(
      (l, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><b>${e(l.productName)}</b>${l.isAlternative ? `<div class="sub">${e(t('Alternative'))}</div>` : ''}${
        l.batchNumber
          ? `<div class="sub">${e(t('Batch'))} ${e(l.batchNumber)}</div>`
          : ''
      }${l.serialNumbers?.length ? `<div class="sub mono">${e(l.serialNumbers.join(', '))}</div>` : ''}</td>
      <td class="num">${e(fmtQty(l.quantity))} ${e(l.unit || '')}</td>
      ${money(`<td class="num">${e(formatMoney(l.unitCost || 0))}</td>
      <td class="num">${e(formatMoney(l.totalCost || 0))}</td>`)}
    </tr>`
    )
    .join('')
  const overrides = (v.overrides || [])
    .map((o) => `<li>${e(t('Line'))} ${o.line}: ${e(o.message)}</li>`)
    .join('')
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(v.issueNumber)} — ${e(t('Material Issue Voucher'))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#0f172a;font-size:11px}
  .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:12px}
  h1{font-size:18px;margin:0}
  .no{font-family:ui-monospace,monospace;font-size:14px;font-weight:700}
  dl{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin:0 0 14px}
  dt{color:#64748b;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
  dd{margin:1px 0 0;font-weight:500}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;text-align:left;padding:6px;border:1px solid #cbd5e1;font-size:10px}
  td{padding:6px;border:1px solid #e2e8f0;vertical-align:top}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .sub{color:#64748b;font-size:9.5px;margin-top:1px}
  .mono{font-family:ui-monospace,monospace}
  .total{margin-left:auto;margin-top:10px;width:260px;display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:4px;font-weight:700;font-size:13px}
  .warn{margin-top:12px;border:1px solid #f59e0b;background:#fffbeb;padding:6px 10px}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px}
  .sign div{border-top:1px solid #0f172a;padding-top:4px;color:#64748b;font-size:9.5px}
  @media print{body{margin:10mm} thead{display:table-header-group} tr{break-inside:avoid}}
</style></head><body>
  <div class="top"><div><h1>${e(t('Material Issue Voucher'))}</h1></div><div class="no">${e(v.issueNumber)}${
    v.status === 'cancelled'
      ? ` <span style="color:#be123c;border:1.5px solid #be123c;border-radius:4px;padding:1px 6px;font-size:12px;letter-spacing:.08em">${e(t('CANCELLED'))}</span>`
      : ''
  }</div></div>
  <dl>${head.map(([k, val]) => `<div><dt>${e(k)}</dt><dd>${e(val)}</dd></div>`).join('')}</dl>
  ${v.notes ? `<p><b>${e(t('Notes'))}:</b> ${e(v.notes)}</p>` : ''}
  <table><thead><tr>
    <th class="num">#</th><th>${e(t('Material'))}</th><th class="num">${e(t('Qty issued'))}</th>
    ${money(`<th class="num">${e(t('Unit cost'))}</th><th class="num">${e(t('Value'))}</th>`)}
  </tr></thead><tbody>${rows}</tbody></table>
  ${money(`<div class="total"><span>${e(t('Total value'))}</span><span>${e(formatMoney(v.totalCost || 0))}</span></div>`)}
  ${overrides ? `<div class="warn"><b>${e(t('Overridden warnings'))}</b><ul>${overrides}</ul></div>` : ''}
  <div class="sign"><div>${e(t('Requested by'))}</div><div>${e(t('Issued by (store)'))}</div><div>${e(t('Received by (production)'))}</div></div>
</body></html>`
  const w = window.open(
    '',
    '_blank',
    'width=1000,height=800,scrollbars=yes,resizable=yes'
  )
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  return true
}
