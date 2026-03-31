// Repair job receipt print utility — 3-inch (80mm) thermal printer format

export interface RepairReceiptData {
  customerName: string
  phone?: string
  deviceModel: string
  serialNumber?: string
  color?: string
  accessories?: string
  issue: string
  technician?: string
  status: string
  charges: number
  advanceAmount: number
  paymentMethod: string
  date?: string
  // Branch / company info
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    delivered: 'Delivered',
  }
  return map[s] ?? s
}

const fmtAmt = (n: number) => `Rs ${n.toLocaleString('en-PK')}`

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })

export function generateRepairReceiptHTML(data: RepairReceiptData): string {
  const {
    customerName,
    phone,
    deviceModel,
    serialNumber,
    color,
    accessories,
    issue,
    technician,
    status,
    charges,
    advanceAmount,
    paymentMethod,
    date,
    companyName = 'Mobile Shop',
    companyAddress,
    companyPhone,
    companyEmail,
  } = data

  const balance = charges - advanceAmount

  const infoRow = (label: string, value: string | undefined) =>
    value
      ? `<div class="info-row"><span class="label">${label}:</span><span class="value">${value}</span></div>`
      : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Repair Job Card</title>
  <style>
    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.5;
      width: 80mm;
      margin: 0 auto;
      padding: 8mm 6mm 10mm;
      background: #fff;
      color: #000;
    }

    /* ── Header ── */
    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .company-logo {
      max-width: 100px;
      height: auto;
      margin: 0 auto 4px;
      display: block;
    }
    .company-name {
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .company-meta {
      font-size: 10px;
      margin-top: 2px;
    }
    .receipt-title {
      font-size: 13px;
      font-weight: bold;
      margin-top: 6px;
      border: 1px solid #000;
      display: inline-block;
      padding: 2px 10px;
      letter-spacing: 1px;
    }

    /* ── Info rows ── */
    .section {
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .section-title {
      font-weight: bold;
      font-size: 11px;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 5px;
      letter-spacing: 0.5px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 11px;
    }
    .label { font-weight: bold; min-width: 90px; }
    .value { text-align: right; flex: 1; }

    /* ── Issue block ── */
    .issue-block {
      font-size: 11px;
      margin-bottom: 3px;
    }
    .issue-text {
      font-size: 11px;
      padding: 4px 0;
      word-break: break-word;
    }

    /* ── Charges table ── */
    .charges-section {
      margin-bottom: 8px;
      border-bottom: 1px dashed #000;
      padding-bottom: 8px;
    }
    .charge-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 3px;
    }
    .charge-row.total {
      font-size: 13px;
      font-weight: bold;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 4px;
    }
    .charge-row.advance { color: #000; }
    .charge-row.balance-due {
      font-size: 13px;
      font-weight: bold;
    }
    .balance-paid {
      font-size: 12px;
      font-weight: bold;
      text-align: center;
      padding: 2px;
      border: 1px solid #000;
      margin-top: 4px;
    }

    /* ── Status badge ── */
    .status-badge {
      text-align: center;
      font-weight: bold;
      font-size: 11px;
      border: 1px solid #000;
      display: inline-block;
      padding: 1px 8px;
      margin-bottom: 4px;
    }

    /* ── Signatures ── */
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
      gap: 20px;
    }
    .sig-box {
      flex: 1;
      border-top: 1px solid #000;
      padding-top: 3px;
      text-align: center;
      font-size: 10px;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 2px solid #000;
      font-size: 10px;
      line-height: 1.6;
    }

    /* ── No-print button ── */
    .no-print {
      margin: 16px 0 0;
      text-align: center;
    }
    .btn {
      padding: 6px 14px;
      margin: 0 4px;
      font-size: 12px;
      border: 1px solid #333;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
    }
    .btn-primary { background: #1a1a1a; color: #fff; }
    .btn-secondary { background: #eee; color: #333; }

    @media screen {
      body {
        max-width: 340px;
        margin: 20px auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 20px;
        border-radius: 6px;
      }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <img src="/images/logo-light.png" alt="${companyName}" class="company-logo" onerror="this.style.display='none'" />
    <div class="company-name">${companyName}</div>
    ${companyAddress ? `<div class="company-meta">${companyAddress}</div>` : ''}
    ${companyPhone ? `<div class="company-meta">Ph: ${companyPhone}</div>` : ''}
    ${companyEmail ? `<div class="company-meta">${companyEmail}</div>` : ''}
    <div class="receipt-title">REPAIR JOB CARD</div>
  </div>

  <!-- Meta -->
  <div class="section">
    ${infoRow('Date', fmtDate(date))}
    ${infoRow('Status', statusLabel(status))}
    ${infoRow('Payment', paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1))}
  </div>

  <!-- Customer info -->
  <div class="section">
    <div class="section-title">Customer Info</div>
    ${infoRow('Name', customerName)}
    ${infoRow('Phone', phone)}
  </div>

  <!-- Device info -->
  <div class="section">
    <div class="section-title">Device Info</div>
    ${infoRow('Model', deviceModel)}
    ${infoRow('Color', color)}
    ${infoRow('IMEI / Serial', serialNumber)}
    ${infoRow('Technician', technician)}
    ${accessories ? infoRow('Accessories', accessories) : ''}
  </div>

  <!-- Issue -->
  <div class="section">
    <div class="section-title">Fault / Issue</div>
    <div class="issue-text">${issue}</div>
  </div>

  <!-- Charges -->
  <div class="charges-section">
    <div class="section-title">Charges</div>
    <div class="charge-row total">
      <span>Total Charges</span>
      <span>${fmtAmt(charges)}</span>
    </div>
    <div class="charge-row advance">
      <span>Advance Paid</span>
      <span>${fmtAmt(advanceAmount)}</span>
    </div>
    ${
      balance > 0
        ? `<div class="charge-row balance-due">
             <span>Balance Due</span>
             <span>${fmtAmt(balance)}</span>
           </div>`
        : `<div class="balance-paid">✓ FULLY PAID</div>`
    }
  </div>

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-box">Customer Signature</div>
    <div class="sig-box">Technician Signature</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div><strong>Thank you for your visit!</strong></div>
    <div>Please keep this receipt for collection.</div>
    ${companyPhone ? `<div>Contact: ${companyPhone}</div>` : ''}
  </div>

  <!-- Print button (hidden when printing) -->
  <div class="no-print">
    <button class="btn btn-primary" onclick="window.print()">Print</button>
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
  </div>

</body>
</html>
`.trim()
}

export function openRepairPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes,resizable=yes')
  if (!win) {
    alert('Please allow popups to print. Check your browser settings.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // Delay print to allow fonts/images to load
  win.setTimeout(() => {
    win.print()
  }, 600)
}
