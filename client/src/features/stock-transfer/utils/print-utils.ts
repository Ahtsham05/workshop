import { escapeHtml, invoiceNoteToSafeHtml } from '@/lib/escape-html'
import type { InventoryTransfer, TransferStatus } from '@/stores/inventoryTransfer.api'

export type TransferPrintLanguage = 'en' | 'ur'

export interface PrintTransferData {
  transferId: string
  productName: string
  quantity: number
  imeis?: string[]
  batchNumber?: string
  fromBranchName: string
  toBranchName: string
  status: TransferStatus
  reason?: string
  notes?: string
  transferDate?: string
  completedAt?: string
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyLogo?: string
  language?: TransferPrintLanguage
}

const labels = {
  en: {
    doc_title: 'Stock Transfer Note',
    transfer_no: 'Transfer No',
    date: 'Date',
    status: 'Status',
    from_branch: 'From',
    to_branch: 'To',
    completed_on: 'Completed On',
    items_header: 'Product Details',
    item: 'Item',
    imei_serial: 'IMEI/Serial',
    batch: 'Batch',
    qty: 'Qty',
    reason: 'Reason',
    notes: 'Notes',
    branch_authorization: 'Branch Authorization',
    stamp_here: 'Stamp / Seal',
    authorized_signature: 'Authorized Signature',
    received_by: 'Received By',
    receiver_name: 'Name',
    receiver_contact: 'Contact',
    receiver_signature: 'Signature',
    received_date: 'Date',
    computer_generated: 'This is a computer-generated document. Signatures above confirm physical handover of the stock listed.',
    print_options: 'Print Options',
    print_document: 'Print',
    close: 'Close',
    powered_by: 'Logix Plus Software Solutions',
    status_suggested: 'Suggested',
    status_approved: 'Approved',
    status_in_transit: 'In Transit',
    status_completed: 'Completed',
    status_cancelled: 'Cancelled',
  },
  ur: {
    doc_title: 'اسٹاک ٹرانسفر نوٹ',
    transfer_no: 'ٹرانسفر نمبر',
    date: 'تاریخ',
    status: 'حیثیت',
    from_branch: 'بھیجنے والی برانچ',
    to_branch: 'وصول کرنے والی برانچ',
    completed_on: 'تکمیل کی تاریخ',
    items_header: 'پروڈکٹ کی تفصیلات',
    item: 'آئٹم',
    imei_serial: 'آئی ایم ای آئی / سیریل',
    batch: 'بیچ',
    qty: 'مقدار',
    reason: 'وجہ',
    notes: 'نوٹس',
    branch_authorization: 'برانچ کی توثیق',
    stamp_here: 'مہر / اسٹیمپ',
    authorized_signature: 'مجاز دستخط',
    received_by: 'وصول کنندہ',
    receiver_name: 'نام',
    receiver_contact: 'رابطہ',
    receiver_signature: 'دستخط',
    received_date: 'تاریخ',
    computer_generated: 'یہ کمپیوٹر سے تیار کردہ دستاویز ہے۔ اوپر دیے گئے دستخط سامان کی حوالگی کی تصدیق کرتے ہیں۔',
    print_options: 'پرنٹ آپشنز',
    print_document: 'پرنٹ کریں',
    close: 'بند کریں',
    powered_by: 'Logix Plus Software Solutions',
    status_suggested: 'تجویز کردہ',
    status_approved: 'منظور شدہ',
    status_in_transit: 'راستے میں',
    status_completed: 'مکمل',
    status_cancelled: 'منسوخ شدہ',
  },
} as const

const statusLabelKey: Record<TransferStatus, keyof (typeof labels)['en']> = {
  suggested: 'status_suggested',
  approved: 'status_approved',
  in_transit: 'status_in_transit',
  completed: 'status_completed',
  cancelled: 'status_cancelled',
}

function branchRefName(ref: InventoryTransfer['fromBranchId']): string {
  if (typeof ref === 'string') return ref
  return ref?.name || '—'
}

export function buildTransferPrintData(
  tr: InventoryTransfer,
  extra: { companyName?: string; companyAddress?: string; companyPhone?: string; companyLogo?: string; language?: TransferPrintLanguage } = {}
): PrintTransferData {
  return {
    transferId: tr.id,
    productName: tr.productName,
    quantity: tr.quantity,
    imeis: tr.imeis,
    batchNumber: tr.batchSnapshot?.batchNumber,
    fromBranchName: branchRefName(tr.fromBranchId),
    toBranchName: branchRefName(tr.toBranchId),
    status: tr.status,
    reason: tr.reason,
    notes: tr.notes,
    transferDate: tr.suggestedAt,
    completedAt: tr.completedAt,
    companyName: extra.companyName,
    companyAddress: extra.companyAddress,
    companyPhone: extra.companyPhone,
    companyLogo: extra.companyLogo,
    language: extra.language,
  }
}

export const generateTransferHTML = (data: PrintTransferData): string => {
  const language: TransferPrintLanguage = data.language === 'ur' ? 'ur' : 'en'
  const texts = labels[language]
  const dir = language === 'ur' ? 'rtl' : 'ltr'
  const startAlign = language === 'ur' ? 'right' : 'left'
  const locale = language === 'ur' ? 'ur-PK' : 'en-PK'

  const statusText = texts[statusLabelKey[data.status]]
  const transferRef = `TRF-${data.transferId.slice(-8).toUpperCase()}`
  const companyName = data.companyName ? escapeHtml(data.companyName) : 'Logix Plus Solutions'
  const productName = escapeHtml(data.productName)
  const fromBranch = escapeHtml(data.fromBranchName)
  const toBranch = escapeHtml(data.toBranchName)
  const batchNumber = data.batchNumber ? escapeHtml(data.batchNumber) : ''
  const imeis = data.imeis && data.imeis.length > 0 ? data.imeis.map(escapeHtml) : []
  const reasonHtml = data.reason?.trim() ? invoiceNoteToSafeHtml(data.reason) : ''
  const notesHtml = data.notes?.trim() ? invoiceNoteToSafeHtml(data.notes) : ''

  const fmtDate = (value?: string) => {
    if (!value) return '—'
    const d = new Date(value)
    return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale)}`
  }

  const infoRow = (label: string, value: string) =>
    `<div class="info-row"><span class="info-label">${label}:</span><span>${value}</span></div>`

  const itemRows = imeis.length > 0
    ? imeis.map((imei, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${productName}</td>
          <td>${imei}</td>
          <td>1</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td>1</td>
          <td>${productName}${batchNumber ? `<br><span style="font-size:9px;color:#555;">${texts.batch}: ${batchNumber}</span>` : ''}</td>
          <td>—</td>
          <td>${data.quantity}</td>
        </tr>
      `

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${texts.doc_title} ${transferRef}</title>
  <style>
    @media print {
      @page { margin: 5mm; size: 80mm auto; }
      body { margin: 0; padding: 0; font-size: 13px; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Inter', 'Manrope', 'Noto Nastaliq Urdu', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px; line-height: 1.4; margin: 0; padding: 8px; width: 300px;
      background: white; color: #000; direction: ${dir}; text-align: ${startAlign};
    }
    .receipt-header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .company-logo { max-width: 120px; height: auto; margin: 0 auto 8px; display: block; }
    .business-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
    .business-info { font-size: 10px; margin-bottom: 1px; }
    .doc-badge { font-size: 13px; font-weight: bold; margin-top: 6px; border: 1px solid #000; display: inline-block; padding: 2px 10px; }
    .transfer-info { margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px; font-size: 12px; }
    .info-label { font-weight: bold; }
    .items-section { margin-bottom: 12px; }
    .items-header { border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; font-weight: bold; font-size: 12px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 4px; table-layout: fixed; }
    .items-table th { border-bottom: 1px dashed #000; padding: 3px 2px; text-align: ${startAlign}; font-weight: bold; font-size: 11px; white-space: nowrap; }
    .items-table th:first-child { width: 16px; text-align: center; }
    .items-table th:last-child { width: 28px; text-align: center; }
    .items-table td { padding: 3px 2px; vertical-align: top; border-bottom: 1px dotted #ddd; font-size: 11px; word-wrap: break-word; overflow-wrap: break-word; }
    .items-table td:first-child { text-align: center; }
    .items-table td:last-child { text-align: center; font-weight: bold; }
    .notes-section { margin: 10px 0; padding: 8px 0; border-top: 1px dashed #000; font-size: 10px; }
    .notes-title { font-weight: bold; margin-bottom: 3px; }
    .signatures-section { margin-top: 16px; border-top: 1px dashed #000; padding-top: 12px; }
    .sig-block { margin-bottom: 18px; }
    .sig-block:last-child { margin-bottom: 0; }
    .sig-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px; }
    .sig-row { display: flex; align-items: flex-end; gap: 10px; }
    .stamp-circle {
      width: 56px; height: 56px; border: 1px dashed #666; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; text-align: center;
      font-size: 7px; color: #666; line-height: 1.2; padding: 2px;
    }
    .sig-line-wrap { flex: 1; }
    .sig-line { border-bottom: 1px solid #000; height: 30px; }
    .sig-caption { font-size: 9px; margin-top: 3px; }
    .sig-field { font-size: 11px; margin-bottom: 12px; border-bottom: 1px dotted #999; padding-bottom: 4px; }
    .invoice-branch-note { margin: 10px 0 0; padding: 8px 4px 0; border-top: 1px dashed #666; font-size: 9.5px; text-align: center; line-height: 1.35; white-space: normal; word-break: break-word; }
    .footer { text-align: center; font-size: 9px; margin-top: 12px; border-top: 2px solid #000; padding-top: 8px; }
    .footer-line { margin-bottom: 2px; }
    .no-print { text-align: center; margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; }
    .print-btn { padding: 8px 16px; margin: 0 5px; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; }
    .print-btn-primary { background: #007bff; color: white; }
    .print-btn-secondary { background: #6c757d; color: white; }
    .highlight { background: #ffffcc; padding: 1px 2px; }
    @media screen { body { max-width: 350px; margin: 20px auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 20px; border-radius: 8px; } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="receipt-header">
    ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${companyName}" class="company-logo" />` : ''}
    <div class="business-name">${companyName}</div>
    ${data.companyAddress ? `<div class="business-info">${escapeHtml(data.companyAddress)}</div>` : ''}
    ${data.companyPhone ? `<div class="business-info">${escapeHtml(data.companyPhone)}</div>` : ''}
    <div class="doc-badge">${texts.doc_title}</div>
  </div>

  <div class="transfer-info">
    ${infoRow(texts.transfer_no, `<span class="highlight">${transferRef}</span>`)}
    ${infoRow(texts.date, fmtDate(data.transferDate))}
    ${infoRow(texts.status, statusText)}
    ${infoRow(texts.from_branch, fromBranch)}
    ${infoRow(texts.to_branch, toBranch)}
    ${data.completedAt ? infoRow(texts.completed_on, fmtDate(data.completedAt)) : ''}
  </div>

  <div class="items-section">
    <div class="items-header">${texts.items_header}</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${texts.item}</th>
          <th>${texts.imei_serial}</th>
          <th>${texts.qty}</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>

  ${reasonHtml ? `<div class="notes-section"><div class="notes-title">${texts.reason}:</div><div>${reasonHtml}</div></div>` : ''}
  ${notesHtml ? `<div class="notes-section"><div class="notes-title">${texts.notes}:</div><div>${notesHtml}</div></div>` : ''}

  <div class="signatures-section">
    <div class="sig-block">
      <div class="sig-title">${texts.branch_authorization}</div>
      <div class="sig-row">
        <div class="stamp-circle">${texts.stamp_here}</div>
        <div class="sig-line-wrap">
          <div class="sig-line"></div>
          <div class="sig-caption">${texts.authorized_signature}</div>
        </div>
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-title">${texts.received_by}</div>
      <div class="sig-field">${texts.receiver_name}: </div>
      <div class="sig-field">${texts.receiver_contact}: </div>
      <div class="sig-line"></div>
      <div class="sig-caption">${texts.receiver_signature}</div>
      <div class="sig-field" style="margin-top: 10px; border-bottom: none;">${texts.received_date}: </div>
    </div>
  </div>

  <div class="invoice-branch-note">${texts.computer_generated}</div>

  <div class="footer">
    <div class="footer-line" style="font-weight: bold;">${texts.powered_by}</div>
  </div>

  <div class="no-print">
    <div style="margin-bottom: 10px; font-weight: bold;">${texts.print_options}</div>
    <button onclick="window.print()" class="print-btn print-btn-primary">${texts.print_document}</button>
    <button onclick="window.close()" class="print-btn print-btn-secondary">${texts.close}</button>
  </div>
</body>
</html>
  `.trim()
}

export const openTransferPrintWindow = (htmlContent: string): void => {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(blobUrl, '_blank', 'width=400,height=700,scrollbars=yes,resizable=yes')
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl)
    throw new Error('Unable to open print window. Please check your popup blocker.')
  }
  printWindow.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true })
}
