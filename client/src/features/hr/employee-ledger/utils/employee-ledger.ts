import type { EmployeeLedgerTransactionType, EmployeeStatementRow } from '@/stores/hr.api'

/*
 * One place for how an employee's ledger reads — the Employee Ledger page, the quick view on
 * vouchers and the printed statement all use it.
 *
 * Balance sign (as stored by the server): + = the business owes the employee (salary payable),
 * − = the employee owes the business (advance / loan outstanding). A person reading a statement
 * should never have to know that, so balances are always shown as an amount + "Payable" / "Advance".
 */

export const TRANSACTION_LABELS: Record<EmployeeLedgerTransactionType, string> = {
  salary_payable: 'Salary Earned',
  salary_payment: 'Salary Paid',
  advance_payment: 'Advance Given',
  advance_recovery: 'Advance Adjusted',
  payment_received: 'Cash Received',
  adjustment: 'Adjustment',
}

/** Badge colour per entry type. */
export const TRANSACTION_BADGE: Record<EmployeeLedgerTransactionType, string> = {
  salary_payable: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  salary_payment: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  advance_payment: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  advance_recovery: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
  payment_received: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300',
  adjustment: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300',
}

/** A store purchase on account shows up as an advance, but reads better as what it was. */
export const rowTypeLabel = (row: Pick<EmployeeStatementRow, 'transactionType' | 'referenceModel'>) => {
  if (row.transactionType === 'advance_payment' && row.referenceModel && !['PaymentVoucher', 'EmployeeLedger', 'Payroll'].includes(row.referenceModel)) {
    return 'Store Purchase'
  }
  return TRANSACTION_LABELS[row.transactionType] ?? row.transactionType
}

export type BalanceSide = 'payable' | 'advance' | 'settled'

export const balanceSide = (balance: number): BalanceSide =>
  balance > 0.005 ? 'payable' : balance < -0.005 ? 'advance' : 'settled'

export const BALANCE_SIDE_LABEL: Record<BalanceSide, string> = {
  payable: 'Payable',
  advance: 'Advance',
  settled: 'Settled',
}

/** Longer wording for a summary line ("we owe Ali Rs 5,000"). */
export const BALANCE_SIDE_HINT: Record<BalanceSide, string> = {
  payable: 'Salary due to the employee',
  advance: 'Employee owes the business',
  settled: 'Nothing due either way',
}

export const BALANCE_TONE: Record<BalanceSide, string> = {
  payable: 'text-amber-700 dark:text-amber-400',
  advance: 'text-sky-700 dark:text-sky-400',
  settled: 'text-muted-foreground',
}

/** "Rs 5,000 Payable" / "Rs 2,000 Advance" / "Settled". */
export const formatBalance = (balance: number, formatMoney: (n: number) => string) => {
  const side = balanceSide(balance)
  return side === 'settled' ? 'Settled' : `${formatMoney(Math.abs(balance))} ${BALANCE_SIDE_LABEL[side]}`
}

/** Where the money went / came from, e.g. "HBL" or "Cash in Hand" — never the raw "wallet" key. */
export const accountOf = (row: Pick<EmployeeStatementRow, 'paymentMethod' | 'walletType' | 'transactionType'>) => {
  if (row.transactionType === 'salary_payable' || row.transactionType === 'advance_recovery') return ''
  if (row.walletType) return row.walletType
  const method = String(row.paymentMethod || '').trim()
  if (!method) return ''
  if (method.toLowerCase() === 'cash') return 'Cash'
  if (method.toLowerCase() === 'wallet') return 'Bank Account'
  return method
}

/** Voucher a row came from, for a link to it. */
export const sourceVoucherOf = (row: Pick<EmployeeStatementRow, 'referenceModel' | 'referenceId' | 'reference'>) => {
  if (row.referenceModel === 'PaymentVoucher' && row.referenceId) return { kind: 'payment' as const, id: row.referenceId, number: row.reference }
  if (row.referenceModel === 'ReceiptVoucher' && row.referenceId) return { kind: 'receipt' as const, id: row.referenceId, number: row.reference }
  return null
}
