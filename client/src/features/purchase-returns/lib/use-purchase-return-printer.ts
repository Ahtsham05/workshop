import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useFormatMoney } from '@/lib/format-money'
import { formatBusinessDate } from '@/lib/business-timezone'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'

/** Everything a printed purchase return (debit note) shows — built from the saved return
 *  plus the names the form/list already has, so printing needs no extra request. */
export interface PrintablePurchaseReturn {
  returnNumber?: string
  date?: string | Date
  supplierName: string
  supplierPhone?: string
  purchaseNumber?: string
  vendorBillNumber?: string
  refundMethod: 'cash' | 'bank' | 'adjustment'
  reason?: string
  notes?: string
  items: Array<{ name: string; quantity: number; unit?: string; costPrice: number; total: number }>
  totalAmount: number
}

const REFUND_LABEL: Record<PrintablePurchaseReturn['refundMethod'], string> = {
  adjustment: 'Adjusted in supplier balance',
  cash: 'Cash refund',
  bank: 'Bank refund',
}

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Prints a purchase return as an A4 "Purchase Return / Debit Note" in the branch's own
 * header (name, address, phone, logo) — the same header a printed purchase carries.
 */
export function usePurchaseReturnPrinter() {
  const formatMoney = useFormatMoney()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  return useCallback(
    (doc: PrintablePurchaseReturn) => {
      const company = resolveBranchCompanyName(orgData?.name, branchData?.name)
      const address = [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
        .filter(Boolean)
        .join(', ')
      const contact = [branchData?.phone, branchData?.email].filter(Boolean).join(' · ')
      const logo = orgData?.logo?.url
      const qty = doc.items.reduce((sum, item) => sum + item.quantity, 0)

      const rows = doc.items
        .map(
          (item, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td>${esc(item.name)}</td>
            <td class="r">${esc(item.quantity)}${item.unit ? ` <span class="muted">${esc(item.unit)}</span>` : ''}</td>
            <td class="r">${esc(formatMoney(item.costPrice))}</td>
            <td class="r">${esc(formatMoney(item.total))}</td>
          </tr>`
        )
        .join('')

      const meta = (label: string, value?: string) =>
        value ? `<div class="meta-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : ''

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.returnNumber || 'Purchase Return')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .brand img { height: 56px; width: auto; object-fit: contain; }
  .brand h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #555; }
  .title { text-align: right; }
  .title h2 { margin: 0; font-size: 18px; letter-spacing: .5px; }
  .title .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0; }
  .box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
  .box h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: .5px; }
  .meta-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f1f1; text-align: left; font-size: 11px; text-transform: uppercase; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; }
  .r { text-align: right; } .c { text-align: center; width: 36px; }
  .totals { margin-left: auto; width: 280px; margin-top: 10px; }
  .totals .meta-row { border-bottom: 1px solid #eee; }
  .grand { font-size: 15px; border-top: 2px solid #111; margin-top: 4px; padding-top: 6px !important; }
  .notes { margin-top: 14px; }
  .sign { display: flex; justify-content: space-between; margin-top: 60px; }
  .sign div { border-top: 1px solid #111; width: 200px; text-align: center; padding-top: 4px; font-size: 11px; }
</style></head><body>
  <div class="head">
    <div class="brand">
      ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
      <div>
        <h1>${esc(company)}</h1>
        ${address ? `<div class="muted">${esc(address)}</div>` : ''}
        ${contact ? `<div class="muted">${esc(contact)}</div>` : ''}
      </div>
    </div>
    <div class="title">
      <h2>PURCHASE RETURN</h2>
      <div class="sub">Debit Note</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>Returned to</h3>
      <div><b>${esc(doc.supplierName)}</b></div>
      ${doc.supplierPhone ? `<div class="muted">${esc(doc.supplierPhone)}</div>` : ''}
    </div>
    <div class="box">
      ${meta('Return No', doc.returnNumber)}
      ${meta('Date', doc.date ? formatBusinessDate(doc.date) : undefined)}
      ${meta('Against Purchase', doc.purchaseNumber)}
      ${meta('Vendor Bill No', doc.vendorBillNumber)}
      ${meta('Settlement', REFUND_LABEL[doc.refundMethod])}
    </div>
  </div>

  <table>
    <thead><tr><th class="c">#</th><th>Product</th><th class="r">Qty</th><th class="r">Cost Price</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="meta-row"><span>Items</span><b>${doc.items.length}</b></div>
    <div class="meta-row"><span>Total Quantity</span><b>${qty}</b></div>
    <div class="meta-row grand"><span>Total Return</span><b>${esc(formatMoney(doc.totalAmount))}</b></div>
  </div>

  ${doc.reason ? `<div class="notes"><b>Reason:</b> ${esc(doc.reason)}</div>` : ''}
  ${doc.notes ? `<div class="notes"><b>Notes / Condition:</b> ${esc(doc.notes)}</div>` : ''}

  <div class="sign"><div>Prepared by</div><div>Received by (Supplier)</div></div>
</body></html>`

      const win = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes,resizable=yes')
      if (!win) {
        toast.error('Allow pop-ups to print')
        return
      }
      win.document.write(html)
      win.document.close()
      // Wait for the logo so it isn't missing from the printout; the timer is only a
      // fallback for browsers that never fire load on a document.write window.
      let printed = false
      const printOnce = () => {
        if (printed) return
        printed = true
        try { win.print() } catch { /* window closed */ }
      }
      win.onload = printOnce
      setTimeout(printOnce, 800)
    },
    [branchData, orgData, formatMoney]
  )
}
