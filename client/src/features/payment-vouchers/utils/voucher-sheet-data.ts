import type { PaymentVoucherRecord } from '@/stores/paymentVoucher.api'
import type { ReceiptVoucherRecord } from '@/stores/receiptVoucher.api'

/** How each kind of line is labelled and coloured — shared by the lists and the detail sheet so
 *  a "Supplier" badge can't look different in two places. `mixed` is only for a whole voucher
 *  that spans more than one line type. */
export const PAYEE_TYPE_BADGE_CLASS: Record<string, string> = {
  expense: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  supplier: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  other: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  mixed: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
}

export const PAYEE_TYPE_LABELS: Record<string, string> = {
  expense: 'Expense',
  supplier: 'Supplier',
  other: 'Other',
}

export const SOURCE_TYPE_BADGE_CLASS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  income: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  mixed: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  income: 'Income',
}

export interface VoucherSheetLine {
  id: string
  partyName: string
  typeLabel: string
  typeClassName: string
  description?: string
  amount: number
}

/** Everything the detail sheet shows, in one kind-agnostic shape (a payment line's `payeeName`
 *  and a receipt line's `payerName` are both just the "party"). */
export interface VoucherSheetData {
  id: string
  voucherNumber: string
  date: string
  bankAccountName?: string
  reference?: string
  notes?: string
  totalAmount: number
  createdAt: string
  updatedAt?: string
  createdByName?: string
  updatedByName?: string
  /** Set whenever the voucher was edited after it was created. Known even from a list row,
   *  where the editor is only a bare id rather than a resolved name. */
  isEdited: boolean
  lines: VoucherSheetLine[]
}

const nameOf = (user?: { name?: string } | string) => (user && typeof user === 'object' ? user.name : undefined)

export const toPaymentSheetData = (voucher: PaymentVoucherRecord): VoucherSheetData => ({
  id: voucher.id,
  voucherNumber: voucher.voucherNumber,
  date: voucher.date,
  bankAccountName: voucher.bankAccountName,
  reference: voucher.reference,
  notes: voucher.notes,
  totalAmount: Number(voucher.totalAmount || 0),
  createdAt: voucher.createdAt,
  updatedAt: voucher.updatedAt,
  createdByName: nameOf(voucher.createdBy),
  updatedByName: nameOf(voucher.updatedBy),
  isEdited: Boolean(voucher.updatedBy),
  lines: voucher.lines.map((line, index) => ({
    id: line.id ?? String(index),
    partyName: line.payeeName,
    typeLabel: PAYEE_TYPE_LABELS[line.payeeType] ?? line.payeeType,
    typeClassName: PAYEE_TYPE_BADGE_CLASS[line.payeeType] ?? '',
    description: line.description,
    amount: Number(line.amount || 0),
  })),
})

export const toReceiptSheetData = (voucher: ReceiptVoucherRecord): VoucherSheetData => ({
  id: voucher.id,
  voucherNumber: voucher.voucherNumber,
  date: voucher.date,
  bankAccountName: voucher.bankAccountName,
  reference: voucher.reference,
  notes: voucher.notes,
  totalAmount: Number(voucher.totalAmount || 0),
  createdAt: voucher.createdAt,
  updatedAt: voucher.updatedAt,
  createdByName: nameOf(voucher.createdBy),
  updatedByName: nameOf(voucher.updatedBy),
  isEdited: Boolean(voucher.updatedBy),
  lines: voucher.lines.map((line, index) => ({
    id: line.id ?? String(index),
    partyName: line.payerName,
    typeLabel: SOURCE_TYPE_LABELS[line.sourceType] ?? line.sourceType,
    typeClassName: SOURCE_TYPE_BADGE_CLASS[line.sourceType] ?? '',
    description: line.description,
    amount: Number(line.amount || 0),
  })),
})
