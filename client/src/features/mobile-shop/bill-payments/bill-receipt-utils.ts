import type { BillPaymentReceipt } from '@/stores/mobile-shop.api'

export function generateBillReceiptHTML(receipt: BillPaymentReceipt, orgName = 'Mobile Shop'): string {
  const fmt = (n: number) => `Rs. ${n.toLocaleString()}`
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-PK') : '—')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Bill Payment Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 8px; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .title { font-size: 16px; font-weight: bold; }
    .badge { display: inline-block; padding: 2px 6px; border: 1px solid #000; font-size: 11px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${orgName}</div>
    <div>Utility Bill Collection Receipt</div>
  </div>
  <div class="line"></div>
  <div class="row"><span>Customer:</span><span class="bold">${receipt.customerName}</span></div>
  <div class="row"><span>Company:</span><span class="bold">${receipt.companyName}</span></div>
  <div class="row"><span>Bill Type:</span><span>${receipt.billType.charAt(0).toUpperCase() + receipt.billType.slice(1)}</span></div>
  <div class="row"><span>Reference #:</span><span class="bold">${receipt.referenceNumber}</span></div>
  <div class="line"></div>
  <div class="row"><span>Bill Amount:</span><span>${fmt(receipt.billAmount)}</span></div>
  <div class="row"><span>Service Charge:</span><span>${fmt(receipt.serviceCharge)}</span></div>
  <div class="line"></div>
  <div class="row"><span class="bold">Total Paid:</span><span class="bold">${fmt(receipt.totalPaid)}</span></div>
  <div class="row"><span>Payment Method:</span><span>${receipt.paymentMethod.toUpperCase()}</span></div>
  <div class="line"></div>
  <div class="row"><span>Due Date:</span><span>${fmtDate(receipt.dueDate)}</span></div>
  <div class="row"><span>Payment Date:</span><span>${fmtDate(receipt.paymentDate)}</span></div>
  <div class="row"><span>Status:</span><span class="badge">${receipt.status.toUpperCase()}</span></div>
  <div class="line"></div>
  <div class="center">Thank you for using our service!</div>
</body>
</html>`
}

export function openBillReceiptPrintWindow(receipt: BillPaymentReceipt, orgName?: string) {
  const html = generateBillReceiptHTML(receipt, orgName)
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 300)
}
