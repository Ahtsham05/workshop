import { escapeHtml } from '@/lib/escape-html'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import type { WarrantyClaim } from '@/stores/warrantyClaim.api'
import { COVER_META, RESOLUTION_META, STATUS_META } from './claim-meta'

interface ShopInfo {
  name?: string
  address?: string
  phone?: string
  logoUrl?: string
}

/**
 * The slip the customer takes away when leaving a unit for warranty (and the shop's copy):
 * claim number to quote, what was left, the fault, accessories, and the warranty as recorded.
 * 80mm-receipt friendly; prints itself once loaded.
 */
export function buildClaimReceiptHtml(claim: WarrantyClaim, shop: ShopInfo): string {
  const e = (v: unknown) => escapeHtml(String(v ?? ''))
  const row = (label: string, value: string) => (value ? `<tr><th>${e(label)}</th><td>${value}</td></tr>` : '')
  const cover = COVER_META[claim.warranty?.status || 'unknown']
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(claim.claimNumber)} — Warranty claim</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:16px;max-width:380px}
  .c{text-align:center} h1{font-size:16px;margin:4px 0} .muted{color:#555;font-size:11px}
  .badge{display:inline-block;border:1px solid #111;border-radius:4px;padding:2px 8px;font-weight:700;font-size:13px;margin:8px 0}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px} th{text-align:left;font-weight:600;padding:3px 6px 3px 0;vertical-align:top;width:38%;color:#333} td{padding:3px 0}
  .box{border:1px dashed #999;border-radius:6px;padding:8px;margin-top:10px;font-size:12px;white-space:pre-wrap}
  .sign{display:flex;justify-content:space-between;margin-top:36px;font-size:11px} .sign div{border-top:1px solid #111;padding-top:4px;width:45%;text-align:center}
  img{max-height:48px} @media print{body{padding:0}}
</style></head>
<body onload="window.print()">
  <div class="c">
    ${shop.logoUrl ? `<img src="${e(shop.logoUrl)}" alt="">` : ''}
    <h1>${e(shop.name || '')}</h1>
    ${shop.address ? `<div class="muted">${e(shop.address)}</div>` : ''}
    ${shop.phone ? `<div class="muted">${e(shop.phone)}</div>` : ''}
    <div class="badge">WARRANTY CLAIM · ${e(claim.claimNumber)}</div>
  </div>
  <table>
    ${row('Received', e(formatAppDateTime(claim.receivedAt)))}
    ${row('Status', e(STATUS_META[claim.status].label))}
    ${claim.type === 'customer' ? row('Customer', e([claim.customer?.name, claim.customer?.phone].filter(Boolean).join(' · '))) : ''}
    ${row('Product', e(claim.productName + (claim.quantity > 1 ? ` × ${claim.quantity}` : '')))}
    ${row('Serial / IMEI', e(claim.originalSerial || claim.serial))}
    ${claim.replacementSerial ? row('Replacement serial', e(claim.replacementSerial)) : ''}
    ${row('Invoice', e(claim.invoiceNumber))}
    ${row('Sold on', claim.saleDate ? e(formatAppDate(claim.saleDate)) : '')}
    ${row('Warranty', e(cover.label + (claim.warranty?.endDate ? ` (until ${formatAppDate(claim.warranty.endDate)})` : '')))}
    ${row('Accessories', e((claim.accessories || []).join(', ')))}
    ${claim.resolution ? row('Outcome', e(RESOLUTION_META[claim.resolution].label)) : ''}
  </table>
  <div class="box"><b>Fault reported:</b>\n${e(claim.problem)}${claim.conditionNotes ? `\n\n<b>Condition:</b>\n${e(claim.conditionNotes)}` : ''}</div>
  <p class="muted">Please bring this slip when collecting. Repair or replacement is at the supplier's / brand's discretion under their warranty terms.</p>
  <div class="sign"><div>Customer</div><div>Received by</div></div>
</body></html>`
}

export function printClaimReceipt(claim: WarrantyClaim, shop: ShopInfo): void {
  const blob = new Blob([buildClaimReceiptHtml(claim, shop)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=420,height=720,scrollbars=yes,resizable=yes')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error('Unable to open the print window — allow pop-ups for this site.')
  }
  win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
}
