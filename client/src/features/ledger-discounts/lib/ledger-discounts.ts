import type { LedgerDiscountReason, LedgerDiscountSettings } from '@/stores/ledgerDiscounts.api'

/**
 * Ledger discounts — shared client rules. The server (services/ledgerDiscount.service.js)
 * is the authority; these mirror it so the form can warn before saving.
 *
 *   customer ledger → discount_allowed  (credit, we let them pay less)
 *   supplier ledger → discount_received (debit, they let us pay less)
 */

export type LedgerSide = 'customer' | 'supplier'

export const DISCOUNT_TYPE: Record<LedgerSide, 'discount_allowed' | 'discount_received'> = {
  customer: 'discount_allowed',
  supplier: 'discount_received',
}

export const DISCOUNT_TYPES = new Set<string>(['discount_allowed', 'discount_received'])

export const isDiscountType = (type?: string | null) => Boolean(type && DISCOUNT_TYPES.has(type))

export const DEFAULT_DISCOUNT_SETTINGS: LedgerDiscountSettings = {
  enabled: true,
  customerEnabled: true,
  supplierEnabled: true,
  maxPercent: 0,
  maxAmount: 0,
  requireApprovalNote: true,
  requireNote: false,
  defaultReason: 'cash_discount',
  allowStandalone: true,
  quickPercents: [1, 2, 5],
  showOnStatements: true,
  showOnReceipts: true,
}

export interface DiscountReasonOption {
  value: LedgerDiscountReason
  label: string
  urdu: string
  hint: string
}

export const DISCOUNT_REASONS: DiscountReasonOption[] = [
  { value: 'cash_discount', label: 'Cash discount', urdu: 'نقد رعایت', hint: 'Paid in cash / on the spot' },
  { value: 'early_payment', label: 'Early payment discount', urdu: 'جلد ادائیگی رعایت', hint: 'Paid before the due date' },
  { value: 'settlement', label: 'Settlement (balance left)', urdu: 'بقایا چھوڑ دیا', hint: 'Account settled for less — "leave the rest"' },
  { value: 'volume_rebate', label: 'Volume rebate', urdu: 'ریبیٹ', hint: 'Rebate on volume / target bonus' },
  { value: 'round_off', label: 'Round off', urdu: 'راؤنڈ آف', hint: 'Small leftover rounded off' },
  { value: 'goodwill', label: 'Goodwill', urdu: 'خیر سگالی', hint: 'Relationship, complaint or courtesy' },
  { value: 'bad_debt', label: 'Bad debt written off', urdu: 'ناقابل وصول', hint: 'Will not be recovered' },
  { value: 'other', label: 'Other', urdu: 'دیگر', hint: 'Anything else — add a note' },
]

const REASON_BY_VALUE = new Map(DISCOUNT_REASONS.map((r) => [r.value, r]))

export const discountReasonLabel = (reason?: string | null, t?: (key: string) => string) => {
  const found = REASON_BY_VALUE.get((reason || 'other') as LedgerDiscountReason) || REASON_BY_VALUE.get('other')!
  return t ? t(found.label) : found.label
}

export const discountReasonUrdu = (reason?: string | null) =>
  (REASON_BY_VALUE.get((reason || 'other') as LedgerDiscountReason) || REASON_BY_VALUE.get('other')!).urdu

export const discountSideLabel = (side: LedgerSide) => (side === 'customer' ? 'Discount Allowed' : 'Discount Received')

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Amount for a % of a base, in money precision. */
export const percentOf = (base: number, percent: number) => round2((Math.max(0, base) * Math.max(0, percent)) / 100)

/** Effective % of a discount against what it settles (payment + discount, or the balance). */
export const effectivePercent = (discount: number, base: number) => (base > 0 ? Math.round((discount / base) * 10000) / 100 : 0)

export interface DiscountLimitCheck {
  overLimit: boolean
  overPercent: boolean
  overAmount: boolean
  percent: number
  limitText: string
}

/** Same rule as the server: % of (payment + discount) with a payment, else of the balance. */
export function checkDiscountLimit(
  settings: LedgerDiscountSettings,
  { discount, paymentAmount, outstanding }: { discount: number; paymentAmount: number; outstanding: number }
): DiscountLimitCheck {
  const base = paymentAmount > 0 ? paymentAmount + discount : outstanding
  const percent = effectivePercent(discount, base)
  const overPercent = settings.maxPercent > 0 && percent - settings.maxPercent > 0.001
  const overAmount = settings.maxAmount > 0 && discount - settings.maxAmount > 0.005
  const limitText = [overPercent ? `${settings.maxPercent}%` : null, overAmount ? String(settings.maxAmount) : null]
    .filter(Boolean)
    .join(' / ')
  return { overLimit: overPercent || overAmount, overPercent, overAmount, percent, limitText }
}

/** Payment rows that carry a linked discount: { paymentId → discount row }. */
export function indexLinkedDiscounts<T extends { transactionType: string; discount?: { linkedEntryId?: string } | null }>(
  entries: T[]
): Map<string, T> {
  const map = new Map<string, T>()
  for (const entry of entries) {
    if (!isDiscountType(entry.transactionType)) continue
    const linked = entry.discount?.linkedEntryId
    if (linked) map.set(String(linked), entry)
  }
  return map
}

/** Total discount amount in a list of ledger rows. */
export function sumDiscounts(entries: { transactionType: string; debit?: number; credit?: number }[]) {
  let total = 0
  let count = 0
  for (const e of entries) {
    if (!isDiscountType(e.transactionType)) continue
    total += (Number(e.credit) || 0) + (Number(e.debit) || 0)
    count += 1
  }
  return { total: round2(total), count }
}
