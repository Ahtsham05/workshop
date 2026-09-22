import * as XLSX from 'xlsx'
import { format, isValid } from 'date-fns'
import { toast } from 'sonner'
import type { VoucherSheetData } from './voucher-sheet-data'

interface ExportOptions {
  kind: 'payment' | 'receipt'
  /** "Paid To" for payments, "Received From" for receipts. */
  partyColumnLabel: string
  format?: 'xlsx' | 'csv'
}

const voucherTypeCell = (voucher: VoucherSheetData) => {
  const labels = new Set(voucher.lines.map((l) => l.typeLabel))
  return labels.size > 1 ? 'Mixed' : voucher.lines[0]?.typeLabel || '-'
}

const downloadCsv = (rows: Record<string, unknown>[], fileName: string) => {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Exports vouchers already normalized to the kind-agnostic `VoucherSheetData` shape — the same
 *  shape the detail sheet uses — so payment and receipt lists can share one export routine. */
export function exportVouchersToExcel(vouchers: VoucherSheetData[], { kind, partyColumnLabel, format: fileFormat = 'xlsx' }: ExportOptions) {
  if (vouchers.length === 0) {
    toast.error('No vouchers to export')
    return
  }

  const rows = vouchers.map((v) => {
    const date = new Date(v.date)
    return {
      'Voucher #': v.voucherNumber,
      Date: isValid(date) ? format(date, 'yyyy-MM-dd') : v.date,
      'Bank Account': v.bankAccountName || '-',
      [partyColumnLabel]: v.lines.map((l) => l.partyName).join(', '),
      Type: voucherTypeCell(v),
      Amount: v.totalAmount,
      Reference: v.reference || '',
      Notes: v.notes || '',
    }
  })

  const fileStem = `${kind}-vouchers-${format(new Date(), 'yyyy-MM-dd')}`

  if (fileFormat === 'csv') {
    downloadCsv(rows, `${fileStem}.csv`)
  } else {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, kind === 'payment' ? 'Payment Vouchers' : 'Receipt Vouchers')
    XLSX.writeFile(wb, `${fileStem}.xlsx`)
  }
  toast.success('Vouchers exported')
}
