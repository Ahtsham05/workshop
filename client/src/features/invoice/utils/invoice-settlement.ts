import type { DueStatus, SettlementStatus } from '@/stores/customerPayment.api'

export type { DueStatus, SettlementStatus }

/** Same tolerance the server uses (utils/invoiceSettlement.js) — keep the two in step. */
const SETTLEMENT_EPSILON = 0.001

export interface InvoiceSettlement {
  total: number
  settledAmount: number
  remainingAmount: number
  settlementStatus: SettlementStatus
  dueStatus: DueStatus
}

const toNumber = (value: unknown) => Number(value || 0)

/**
 * Settlement for one invoice row.
 *
 * The list endpoint computes this server-side (it has to — it filters and sorts on it) and
 * sends it along, so the happy path is a straight read. The fallback recomputes from raw
 * amounts for rows that arrive from anywhere else (a freshly created invoice, a detail
 * fetch), which keeps every screen agreeing on one definition instead of two. Mirrors
 * purchase-settlement.ts's resolvePurchaseSettlement.
 */
export function resolveInvoiceSettlement(invoice: any): InvoiceSettlement {
  const total = toNumber(invoice?.total)

  if (invoice?.settlementStatus) {
    return {
      total,
      settledAmount: toNumber(invoice.settledAmount),
      remainingAmount: toNumber(invoice.remainingAmount),
      settlementStatus: invoice.settlementStatus as SettlementStatus,
      dueStatus: (invoice.dueStatus || 'no_due_date') as DueStatus,
    }
  }

  const settledAmount = toNumber(invoice?.paidAmount) + toNumber(invoice?.allocatedAmount)
  const remainingAmount = total - settledAmount

  let settlementStatus: SettlementStatus = 'unpaid'
  if (settledAmount > total + SETTLEMENT_EPSILON) settlementStatus = 'overpaid'
  else if (total > 0 && settledAmount >= total - SETTLEMENT_EPSILON) settlementStatus = 'paid'
  else if (settledAmount > SETTLEMENT_EPSILON) settlementStatus = 'partial'
  else if (total <= 0) settlementStatus = 'paid'

  return {
    total,
    settledAmount,
    remainingAmount,
    settlementStatus,
    dueStatus: resolveDueStatus(invoice?.dueDate, remainingAmount),
  }
}

export function resolveDueStatus(dueDate: string | null | undefined, remainingAmount: number): DueStatus {
  if (remainingAmount <= SETTLEMENT_EPSILON) return 'settled'
  if (!dueDate) return 'no_due_date'
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return 'no_due_date'

  const endOfDue = new Date(due)
  endOfDue.setHours(23, 59, 59, 999)
  const now = new Date()
  if (endOfDue < now) return 'overdue'

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  if (due.getTime() < startOfToday.getTime() + dayMs) return 'due_today'
  if (due.getTime() <= startOfToday.getTime() + 7 * dayMs) return 'due_soon'
  return 'not_due'
}

/** Badge copy + colour per settlement status. Tinted backgrounds read correctly in both themes. */
export const SETTLEMENT_STATUS_META: Record<SettlementStatus, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partial', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  unpaid: { label: 'Outstanding', className: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  overpaid: { label: 'Overpaid', className: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400' },
}

export const DUE_STATUS_META: Record<DueStatus, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  due_today: { label: 'Due today', className: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  due_soon: { label: 'Due soon', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  not_due: { label: 'Not due', className: 'border-muted-foreground/20 bg-muted text-muted-foreground' },
  no_due_date: { label: 'No due date', className: 'border-muted-foreground/20 bg-muted text-muted-foreground' },
  settled: { label: 'Settled', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
}
