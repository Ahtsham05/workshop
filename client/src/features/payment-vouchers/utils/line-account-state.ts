import type { LedgerDiscountSettings } from '@/stores/ledgerDiscounts.api'
import { checkDiscountLimit } from '@/features/ledger-discounts/lib/ledger-discounts'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface LineAccountState {
  /** What the party owes before THIS line (after earlier lines for the same party). */
  owingBefore: number | undefined
  remaining: number | undefined
  overLimit: boolean
  /** Blocks saving. */
  error: string | null
}

/** The account maths for one voucher line — shared by the strip and the submit check. */
export function lineAccountState({
  owingBefore,
  amount,
  discount,
  approvalNote,
  settings,
  canGive,
  canApprove,
  t,
}: {
  owingBefore: number | undefined
  amount: number
  discount: number
  approvalNote: string
  settings: LedgerDiscountSettings
  canGive: boolean
  canApprove: boolean
  t: (k: string) => string
}): LineAccountState {
  const remaining = owingBefore === undefined ? undefined : round2(owingBefore - amount - discount)
  if (!(discount > 0)) return { owingBefore, remaining, overLimit: false, error: null }
  if (!canGive) return { owingBefore, remaining, overLimit: false, error: t('You do not have permission to give discounts') }
  if (owingBefore !== undefined && remaining !== undefined && remaining < -0.005) {
    return { owingBefore, remaining, overLimit: false, error: `${t('Discount is more than what is still owing')} (${round2(Math.max(0, owingBefore - amount))})` }
  }
  const limit = checkDiscountLimit(settings, { discount, paymentAmount: amount, outstanding: owingBefore ?? amount + discount })
  if (limit.overLimit && !canApprove) {
    return { owingBefore, remaining, overLimit: true, error: `${t('Above the discount limit of')} ${limit.limitText} — ${t('needs approval')}` }
  }
  if (limit.overLimit && settings.requireApprovalNote && !approvalNote.trim()) {
    return { owingBefore, remaining, overLimit: true, error: t('Write why this discount is approved') }
  }
  return { owingBefore, remaining, overLimit: limit.overLimit, error: null }
}

