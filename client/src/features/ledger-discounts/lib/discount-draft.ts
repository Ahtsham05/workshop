import type { LedgerDiscountReason, LedgerDiscountSettings } from '@/stores/ledgerDiscounts.api'
import { checkDiscountLimit, percentOf } from './ledger-discounts'

/** The discount box's state, and how it turns into what the server gets. */
export interface DiscountDraft {
  enabled: boolean
  mode: 'amount' | 'percent'
  /** What the user typed: rupees in amount mode, % in percent mode. */
  value: string
  reason: LedgerDiscountReason
  note: string
  approvalNote: string
}

export const emptyDiscountDraft = (reason: LedgerDiscountReason = 'cash_discount', enabled = false): DiscountDraft => ({
  enabled,
  mode: 'amount',
  value: '',
  reason,
  note: '',
  approvalNote: '',
})

export interface ResolvedDiscount {
  amount: number
  percent?: number
  baseAmount?: number
  overLimit: boolean
  /** Blocks saving (e.g. more than owed, over limit without approval). */
  error: string | null
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Turn the draft into the numbers the server gets, plus any blocking problem. */
export function resolveDiscount(
  draft: DiscountDraft,
  {
    paymentAmount,
    outstanding,
    settings,
    canApprove,
    t,
  }: { paymentAmount: number; outstanding: number; settings: LedgerDiscountSettings; canApprove: boolean; t: (k: string) => string }
): ResolvedDiscount {
  if (!draft.enabled) return { amount: 0, overLimit: false, error: null }
  const raw = Number(draft.value) || 0
  const amount = draft.mode === 'percent' ? percentOf(outstanding, raw) : round2(raw)
  if (amount <= 0) return { amount: 0, overLimit: false, error: t('Enter the discount amount') }
  const available = round2(outstanding - paymentAmount)
  if (available <= 0.005) {
    return {
      amount,
      overLimit: false,
      error: paymentAmount > 0 ? t('Nothing is left owing after this payment') : t('Nothing is owing on this account'),
    }
  }
  if (amount - available > 0.005) {
    return { amount, overLimit: false, error: `${t('Discount is more than what is still owing')} (${available})` }
  }
  const limit = checkDiscountLimit(settings, { discount: amount, paymentAmount, outstanding })
  let error: string | null = null
  if (limit.overLimit && !canApprove) error = `${t('Above the discount limit of')} ${limit.limitText} — ${t('needs approval')}`
  else if (limit.overLimit && settings.requireApprovalNote && !draft.approvalNote.trim()) error = t('Write why this discount is approved')
  else if (settings.requireNote && !draft.note.trim()) error = t('A note is required for every discount')
  return {
    amount,
    percent: draft.mode === 'percent' ? raw : undefined,
    baseAmount: draft.mode === 'percent' ? round2(outstanding) : undefined,
    overLimit: limit.overLimit,
    error,
  }
}

