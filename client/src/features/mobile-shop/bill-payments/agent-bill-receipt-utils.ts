import type { AgentBillRecord } from '@/stores/mobile-shop.api'

interface AgentBillReceiptOptions {
  orgName?: string
  branchDetails?: {
    name?: string
    address?: string
    phone?: string
    email?: string
    invoiceNote?: string
  }
  logo?: string
}

export function generateAgentBillReceiptHTML(
  bill: AgentBillRecord,
  options: AgentBillReceiptOptions = {},
): string {
  const companyName = options.branchDetails?.name || options.orgName || 'Bill Collection'
  const fmt = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`
  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const printedAt = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Bill Receipt – ${bill.customerName}</title>
  <style>
    @media print {
      @page { margin: 5mm; size: 80mm auto; }
      body { margin: 0; padding: 0; font-size: 12px; }
      .no-print { display: none !important; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      padding: 8px;
      width: 300px;
      background: #fff;
      color: #000;
    }

    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .logo { max-width: 100px; height: auto; margin-bottom: 4px; display: block; margin-left: auto; margin-right: auto; }

    .biz-name {
      font-size: 15px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .biz-info { font-size: 10px; color: #333; margin-top: 2px; }

    .receipt-title {
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      text-decoration: underline;
      margin: 8px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .section {
      border-bottom: 1px dashed #666;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }

    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 11.5px;
    }

    .row .label { font-weight: 600; }

    .divider { border-top: 2px solid #000; margin: 8px 0; }

    .totals { margin-bottom: 8px; }

    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 3px;
    }

    .grand-total {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 700;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 4px;
    }

    .footer {
      text-align: center;
      font-size: 9px;
      border-top: 2px solid #000;
      padding-top: 6px;
      margin-top: 10px;
    }

    .no-print {
      text-align: center;
      margin: 16px 0;
      padding: 10px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .btn {
      padding: 6px 14px;
      margin: 0 4px;
      font-size: 11px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-primary { background: #1e40af; color: #fff; }
    .btn-secondary { background: #6b7280; color: #fff; }

    @media screen {
      body { max-width: 350px; margin: 20px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 20px; border-radius: 6px; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${options.logo ? `<img src="${options.logo}" class="logo" alt="${companyName}" />` : ''}
    <div class="biz-name">${companyName}</div>
    ${options.branchDetails?.address ? `<div class="biz-info">${options.branchDetails.address}</div>` : ''}
    ${
      options.branchDetails?.phone || options.branchDetails?.email
        ? `<div class="biz-info">${[options.branchDetails.phone, options.branchDetails.email].filter(Boolean).join(' | ')}</div>`
        : ''
    }
  </div>

  <div class="receipt-title">Bill Collection Receipt</div>

  <div class="section">
    <div class="row"><span class="label">Customer:</span><span>${bill.customerName}</span></div>
    ${bill.mobileNo ? `<div class="row"><span class="label">Mobile:</span><span>${bill.mobileNo}</span></div>` : ''}
    <div class="row"><span class="label">Reference #:</span><span>${bill.referenceNumber}</span></div>
    ${bill.companyName ? `<div class="row"><span class="label">Company:</span><span>${bill.companyName}</span></div>` : ''}
    ${bill.dueDate ? `<div class="row"><span class="label">Due Date:</span><span>${fmtDate(bill.dueDate)}</span></div>` : ''}
    <div class="row"><span class="label">Printed:</span><span>${printedAt}</span></div>
  </div>

  <div class="totals">
    <div class="grand-total">
      <span>Amount Paid:</span>
      <span>${fmt(bill.currentBillAmount)}</span>
    </div>
  </div>

  <div style="text-align:center;margin:12px 0;">
    <div style="display:inline-block;border:3px solid #16a34a;color:#16a34a;font-size:22px;font-weight:900;padding:4px 18px;border-radius:4px;letter-spacing:3px;transform:rotate(-5deg);opacity:0.85;">
      PAID
    </div>
  </div>

  ${
    options.branchDetails?.invoiceNote?.trim()
      ? `<div style="font-size:10px;text-align:center;border-top:1px dashed #666;padding-top:6px;margin-top:6px;">${options.branchDetails.invoiceNote}</div>`
      : ''
  }

  <div class="footer">
    <div style="font-weight:700;">Thank You!</div>
    <div style="margin-top:3px;color:#555;">Printed: ${printedAt}</div>
    <div style="margin-top:3px;font-weight:600;">Powered by Logix Plus</div>
  </div>

  <div class="no-print">
    <button onclick="window.print()" class="btn btn-primary">🖨️ Print</button>
    <button onclick="window.close()" class="btn btn-secondary">✕ Close</button>
  </div>
</body>
</html>`
}

export function openAgentBillPrintWindow(bill: AgentBillRecord, options?: AgentBillReceiptOptions) {
  const html = generateAgentBillReceiptHTML(bill, options)
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 300)
}

export function openAgentBillsBatchPrint(bills: AgentBillRecord[], options?: AgentBillReceiptOptions) {
  bills.forEach((bill) => openAgentBillPrintWindow(bill, options))
}
