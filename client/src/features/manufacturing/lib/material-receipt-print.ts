import type { MaterialReceipt } from '@/stores/manufacturing.api'
import { fmtDate, fmtQty } from './constants'
import { productTypeLabel } from './material-receipt'
import { escapeHtml } from './order-export'

/**
 * Printable RMV (print / save as PDF through the browser's dialog, like the order list
 * and job card). Returns false when the pop-up was blocked.
 */
export function printMaterialReceipt(
  v: MaterialReceipt,
  {
    branchName,
    formatMoney,
    t,
  }: {
    branchName?: string
    formatMoney: (n: number) => string
    t: (s: string) => string
  }
) {
  const e = escapeHtml
  const head: [string, string][] = [
    [t('Voucher'), v.voucherNumber],
    [t('Date'), fmtDate(v.date)],
    [
      t('Status'),
      t(
        v.status === 'confirmed'
          ? 'Posted'
          : v.status === 'draft'
            ? 'Draft'
            : 'Cancelled'
      ),
    ],
    [t('Supplier'), v.supplierName || '—'],
    [t('Purchase order'), v.purchaseOrderNumber || '—'],
    [t('Purchase invoice'), v.purchaseInvoiceNumber || '—'],
    [t('Branch'), branchName || '—'],
    [t('Warehouse'), v.location || '—'],
    [t('Reference'), v.reference || '—'],
  ]
  const rows = v.lines
    .map(
      (l, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><b>${e(l.productName)}</b>${l.sku ? `<div class="sub">${e(l.sku)}</div>` : ''}<div class="sub">${e(t(productTypeLabel(l.productType)))}</div>${
        l.batchNumber
          ? `<div class="sub">${e(t('Batch'))} ${e(l.batchNumber)}${l.expiryDate ? ` · ${e(t('exp'))} ${e(fmtDate(l.expiryDate))}` : ''}</div>`
          : ''
      }${l.serials?.length ? `<div class="sub mono">${e(l.serials.join(', '))}</div>` : ''}${l.notes ? `<div class="sub">${e(l.notes)}</div>` : ''}</td>
      <td class="num">${e(fmtQty(l.quantity))} ${e(l.unit || '')}</td>
      <td class="num">${e(formatMoney(l.rate || 0))}</td>
      <td class="num">${l.discountPercent ? `${e(fmtQty(l.discountPercent))}%` : ''}</td>
      <td class="num">${l.taxPercent ? `${e(fmtQty(l.taxPercent))}%` : ''}</td>
      <td class="num">${e(formatMoney(l.netAmount || 0))}</td>
      <td>${e(l.location || v.location || '')}</td>
    </tr>`
    )
    .join('')
  const totals: [string, number, boolean][] = [
    [t('Subtotal'), v.totals.subtotal, false],
    [t('Discount'), v.totals.discount, false],
    [t('Tax'), v.totals.tax, false],
    [t('Grand Total'), v.totals.grandTotal, true],
  ]
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(v.voucherNumber)} — ${e(t('Raw Material Receipt'))}</title>
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
  .totals{margin-left:auto;margin-top:10px;width:280px}
  .totals td{border:none;padding:3px 6px}
  .totals tr.grand td{border-top:2px solid #0f172a;font-weight:700;font-size:13px}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:36px}
  .sign div{border-top:1px solid #0f172a;padding-top:4px;color:#64748b;font-size:9.5px}
  @media print{body{margin:10mm} thead{display:table-header-group} tr{break-inside:avoid}}
</style></head><body>
  <div class="top"><div><h1>${e(t('Raw Material Receipt Voucher'))}</h1></div><div class="no">${e(v.voucherNumber)}</div></div>
  <dl>${head.map(([k, val]) => `<div><dt>${e(k)}</dt><dd>${e(val)}</dd></div>`).join('')}</dl>
  ${v.notes ? `<p><b>${e(t('Notes'))}:</b> ${e(v.notes)}</p>` : ''}
  <table><thead><tr>
    <th class="num">#</th><th>${e(t('Product'))}</th><th class="num">${e(t('Qty'))}</th><th class="num">${e(t('Rate'))}</th>
    <th class="num">${e(t('Disc'))}</th><th class="num">${e(t('Tax'))}</th><th class="num">${e(t('Net Cost'))}</th><th>${e(t('Warehouse'))}</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <table class="totals"><tbody>
    <tr><td>${e(t('Total Items'))}</td><td class="num">${v.totals.items}</td></tr>
    <tr><td>${e(t('Total Quantity'))}</td><td class="num">${e(fmtQty(v.totals.quantity))}</td></tr>
    ${totals.map(([k, n, g]) => `<tr${g ? ' class="grand"' : ''}><td>${e(k)}</td><td class="num">${k === t('Discount') && n ? '−' : ''}${e(formatMoney(n))}</td></tr>`).join('')}
  </tbody></table>
  <div class="sign"><div>${e(t('Received by (store)'))}</div><div>${e(t('Checked by (QC)'))}</div><div>${e(t('Approved by (accounts)'))}</div></div>
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
