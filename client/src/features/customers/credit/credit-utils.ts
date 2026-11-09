import type { CreditEventType, CreditRuleReason, CreditStatus, CreditStatusKey } from '@/stores/creditControl.api'

/**
 * Shared bits for the credit-control UI. The rules mirror server
 * services/creditControl.service.js — the server is the authority; these only decide what
 * to show before it is asked.
 */

export const CREDIT_LIMIT_ERROR_CODE = 'CREDIT_LIMIT_EXCEEDED'

export const CREDIT_STATUS_META: Record<
  CreditStatusKey,
  { label: string; badge: string; bar: string; text: string }
> = {
  ok: {
    label: 'Within limit',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  near: {
    label: 'Near limit',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  over: {
    label: 'Over limit',
    badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  },
  hold: {
    label: 'On hold',
    badge: 'border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200',
    bar: 'bg-red-600',
    text: 'text-red-700 dark:text-red-400',
  },
  no_limit: {
    label: 'No limit',
    badge: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    bar: 'bg-slate-400',
    text: 'text-muted-foreground',
  },
}

export const CREDIT_REASON_LABELS: Record<CreditRuleReason, string> = {
  over_limit: 'Over credit limit',
  on_hold: 'Customer on credit hold',
  overdue: 'Overdue invoices',
}

export const CREDIT_EVENT_LABELS: Record<CreditEventType, string> = {
  limit_set: 'Limit set',
  limit_increase: 'Limit increased',
  limit_decrease: 'Limit decreased',
  temp_limit_set: 'Temporary limit',
  temp_limit_cleared: 'Temporary limit removed',
  hold_on: 'Put on credit hold',
  hold_off: 'Released from hold',
  override: 'Sale approved over limit',
  warning: 'Sold after warning',
  offline_sale: 'Offline sale over limit',
}

export interface CreditLimitErrorPayload {
  message: string
  reasons: CreditRuleReason[]
  mode: 'block' | 'warn'
  canOverride: boolean
  credit: CreditStatus
}

/** The server's credit refusal, from an RTK Query or Axios error — null for anything else. */
export function getCreditLimitError(error: unknown): CreditLimitErrorPayload | null {
  if (!error || typeof error !== 'object') return null
  type Body = {
    message?: string
    errorCode?: string
    details?: { reasons?: CreditRuleReason[]; mode?: string; canOverride?: boolean; credit?: CreditStatus }
  }
  const e = error as { data?: Body; response?: { data?: Body } }
  const data = e.data ?? e.response?.data
  if (!data || data.errorCode !== CREDIT_LIMIT_ERROR_CODE || !data.details?.credit) return null
  return {
    message: String(data.message || ''),
    reasons: data.details.reasons || [],
    mode: data.details.mode === 'warn' ? 'warn' : 'block',
    canOverride: Boolean(data.details.canOverride),
    credit: data.details.credit,
  }
}

/** What a sale leaves owing — mirrors the server's unpaidOf (a plain cash sale is fully paid). */
export function invoiceUnpaidAmount(invoice: {
  type?: string
  total?: number
  paidAmount?: number
  splitPaymentMethod?: string | null
}): number {
  if (!invoice || invoice.type === 'quotation') return 0
  if (invoice.type === 'cash' && !invoice.splitPaymentMethod) return 0
  return Math.max(0, Math.round(((Number(invoice.total) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100)
}

/** Which rules a sale of `status.saleAmount` breaks, judged the way the server judges it. */
export function brokenCreditRules(status: CreditStatus): CreditRuleReason[] {
  if (!status.enabled || status.saleAmount <= 0.005) return []
  const reasons: CreditRuleReason[] = []
  if (status.onHold) reasons.push('on_hold')
  if (status.hasLimit && status.projectedExposure > status.limit + 0.005) reasons.push('over_limit')
  if (status.overdueBlockDays > 0 && status.overdue.blockingCount > 0) reasons.push('overdue')
  return reasons
}

/** A round limit that covers `needed` — the suggestion on "Raise limit". */
export function suggestLimit(needed: number): number {
  if (needed <= 0) return 0
  const step = needed >= 1_000_000 ? 50_000 : needed >= 100_000 ? 10_000 : needed >= 10_000 ? 1_000 : 500
  return Math.ceil(needed / step) * step
}

export function addDaysIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
