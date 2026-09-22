import * as XLSX from 'xlsx'
import { format, isValid } from 'date-fns'
import { toast } from 'sonner'
import { DIRECTION_LABELS, METHOD_LABELS, STATUS_LABELS, type PaymentSheetData } from './payment-sheet-data'

interface ExportOptions {
  kind: 'customer' | 'supplier'
  /** "Customer" for customer payments, "Supplier" for supplier payments. */
  partyColumnLabel: string
  format?: 'xlsx' | 'csv'
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

export function exportPaymentsToExcel(payments: PaymentSheetData[], { kind, partyColumnLabel, format: fileFormat = 'xlsx' }: ExportOptions) {
  if (payments.length === 0) {
    toast.error('No payments to export')
    return
  }

  const rows = payments.map((p) => {
    const date = new Date(p.date)
    return {
      'Payment #': p.paymentNumber,
      Date: isValid(date) ? format(date, 'yyyy-MM-dd') : p.date,
      [partyColumnLabel]: p.partyName,
      Type: DIRECTION_LABELS[p.direction] ?? p.direction,
      Method: METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
      Amount: p.amount,
      Status: STATUS_LABELS[p.status] ?? p.status,
      Reference: p.referenceNumber || '',
      Notes: p.notes || '',
    }
  })

  const fileStem = `${kind}-payments-${format(new Date(), 'yyyy-MM-dd')}`

  if (fileFormat === 'csv') {
    downloadCsv(rows, `${fileStem}.csv`)
  } else {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, kind === 'customer' ? 'Customer Payments' : 'Supplier Payments')
    XLSX.writeFile(wb, `${fileStem}.xlsx`)
  }
  toast.success('Payments exported')
}
