import type { StockCount, StockCountLine } from '@/stores/stockCount.api'
import { fmtQty } from './labels'

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/**
 * A paper count sheet: for counting where a phone isn't practical (cold store, ladders),
 * then typing the numbers in. A blind count prints without the expected quantity.
 */
export function printCountSheet(count: StockCount, lines: StockCountLine[], showExpected: boolean, branchName?: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return false
  let lastCategory: string | null = null
  const rows = lines
    .map((line, index) => {
      const category = line.category || ''
      const heading =
        category !== lastCategory
          ? `<tr class="cat"><td colspan="${showExpected ? 6 : 5}">${escapeHtml(category || '—')}</td></tr>`
          : ''
      lastCategory = category
      return `${heading}<tr>
        <td class="n">${index + 1}</td>
        <td>${escapeHtml(line.name)}${line.variantLabel ? ` <span class="muted">— ${escapeHtml(line.variantLabel)}</span>` : ''}${
          line.kind === 'serialized' ? ' <span class="muted">(scan each unit)</span>' : ''
        }</td>
        <td class="muted">${escapeHtml(line.barcode || '')}</td>
        <td class="muted">${escapeHtml(line.unit || '')}</td>
        ${showExpected ? `<td class="num">${fmtQty(line.systemQtyAtStart ?? null)}</td>` : ''}
        <td class="box"></td>
      </tr>`
    })
    .join('')

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(count.number)}</title>
  <style>
    body { font: 12px/1.4 system-ui, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin: 0; }
    .meta { color: #555; margin: 4px 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; color: #555; border-bottom: 2px solid #999; }
    .num { text-align: right; }
    .n { width: 28px; color: #888; }
    .box { width: 90px; border: 1px solid #999; }
    .muted { color: #777; }
    tr.cat td { background: #f2f2f2; font-weight: 600; }
    .sign { margin-top: 28px; display: flex; gap: 48px; }
    .sign div { border-top: 1px solid #999; padding-top: 4px; width: 200px; color: #555; }
    @media print { body { margin: 0; } }
  </style></head><body>
  <h1>${escapeHtml(count.number)} — ${escapeHtml(count.title)}</h1>
  <div class="meta">${escapeHtml(branchName || '')} · ${new Date().toLocaleString()} · ${lines.length} item(s)${count.blind ? ' · Blind count' : ''}</div>
  <table><thead><tr><th>#</th><th>Item</th><th>Barcode</th><th>Unit</th>${showExpected ? '<th class="num">Expected</th>' : ''}<th>Counted</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="sign"><div>Counted by</div><div>Checked by</div><div>Date</div></div>
  <script>window.onload = () => { window.print(); }</script>
  </body></html>`)
  win.document.close()
  return true
}
