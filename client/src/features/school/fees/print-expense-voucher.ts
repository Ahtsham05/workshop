import { printPaymentVoucher, type PrintableVoucherLine } from '@/features/payment-vouchers/utils/print-payment-voucher'
import type { PaperSize, PrintOrientation } from '@/features/invoice/utils/paper-format'
import type { CurrencyOption } from '@/stores/localization.api'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
  other: 'Other',
}

interface ExpenseVoucherLine {
  categoryName?: string
  vendor?: string
  description?: string
  amount: number
}

interface Company {
  name: string
  address?: string
  phone?: string
  currencyMeta?: CurrencyOption
}

/**
 * Prints a "Bulk Expense Voucher" — reuses the app's existing generic Payment
 * Voucher print layout (header, line items, total, signatures) rather than
 * building a parallel print template, since the two documents are the same
 * shape: a voucher number, a date, several paid-out line items, and a total.
 */
export function printExpenseVoucher(
  voucherNumber: string,
  date: string,
  paymentMethod: string,
  lines: ExpenseVoucherLine[],
  company: Company,
  paperSize: PaperSize,
  orientation: PrintOrientation,
) {
  const voucherLines: PrintableVoucherLine[] = lines.map((line) => ({
    payeeType: 'expense',
    category: line.categoryName,
    payeeName: line.vendor || line.categoryName || 'Expense',
    amount: line.amount,
    description: line.description,
  }))

  printPaymentVoucher(
    {
      voucherNumber,
      date,
      bankAccountName: PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod,
      lines: voucherLines,
      totalAmount: lines.reduce((sum, l) => sum + (l.amount || 0), 0),
    },
    company,
    paperSize,
    orientation,
  )
}
