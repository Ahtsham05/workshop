/**
 * Payment method (tender) cards for wholesale / distributor sales: Cash, Credit Card, ACH,
 * Check. Each non-cash tender is backed by a real receiving account (a Wallet flagged with
 * `paymentMode`, auto-created by the server for these business types), so Cash Book, account
 * balances and ledgers keep working exactly like any other account payment.
 *
 * The invoice itself stores `paymentMode` (server-derived) + `paymentReference` (check #,
 * ACH reference, card last-4 / auth code). Display helpers below fall back to the older
 * paymentMethod/walletType pair for invoices saved before paymentMode existed.
 */
import { normalizeBusinessType } from '@/lib/business-types'

export type PaymentMode = 'cash' | 'card' | 'ach' | 'check' | 'bank'

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  card: 'Credit Card',
  ach: 'ACH',
  check: 'Check',
  bank: 'Bank',
}

/** Field label + placeholder for each tender's reference number. */
export const PAYMENT_REFERENCE_FIELD: Partial<Record<PaymentMode, { label: string; placeholder: string }>> = {
  card: { label: 'Card last 4 / Auth #', placeholder: 'e.g. 4242 or auth code' },
  ach: { label: 'ACH reference #', placeholder: 'Trace / confirmation #' },
  check: { label: 'Check #', placeholder: 'e.g. 10234' },
  bank: { label: 'Reference #', placeholder: 'Transfer reference' },
}

/** Short prefix printed in front of the reference: "Check #10234", "ACH Ref 99812". */
const REFERENCE_PREFIX: Partial<Record<PaymentMode, string>> = {
  card: 'Card',
  ach: 'Ref',
  check: '#',
  bank: 'Ref',
}

/** Wholesale + distributor businesses get the payment-method cards on New Invoice / Fast Billing. */
export const usesPaymentMethodCards = (businessType?: string | null) => {
  const type = normalizeBusinessType(businessType)
  return type === 'distributor' || type === 'wholesale'
}

export interface PaymentModeSource {
  type?: string
  paymentMode?: string | null
  paymentMethod?: string | null
  walletType?: string | null
  paymentReference?: string | null
  splitPaymentMethod?: string | null
  splitWalletType?: string | null
  splitPaidAmount?: number | null
}

/** The primary leg's tender, using the legacy paymentMethod when paymentMode is absent. */
export function resolvePaymentMode(src: PaymentModeSource): PaymentMode | null {
  if (src.type === 'quotation' || src.type === 'pending') return null
  if (src.paymentMode && src.paymentMode in PAYMENT_MODE_LABELS) return src.paymentMode as PaymentMode
  const method = String(src.paymentMethod || 'cash').toLowerCase()
  if (method === 'card') return 'card'
  if (method === 'wallet' || method === 'bank') return 'bank'
  return 'cash'
}

/** "Check", "Credit Card", or the account name for a plain bank / wallet account. */
export function getPaymentModeName(src: PaymentModeSource): string {
  const mode = resolvePaymentMode(src)
  if (!mode) return ''
  if (mode === 'bank') return src.walletType || PAYMENT_MODE_LABELS.bank
  return PAYMENT_MODE_LABELS[mode]
}

/** "Check #10234" / "Credit Card · Card 4242" / "Cash" / "Cash + Check" (split). */
export function formatPaymentMethod(
  src: PaymentModeSource,
  opts: { withReference?: boolean; withAccount?: boolean } = {},
): string {
  const mode = resolvePaymentMode(src)
  if (!mode) return ''
  let label = getPaymentModeName(src)
  const ref = (src.paymentReference || '').trim()
  if (opts.withReference !== false && ref && mode !== 'cash') {
    const prefix = REFERENCE_PREFIX[mode] || 'Ref'
    label = prefix === '#' ? `${label} #${ref}` : `${label} · ${prefix} ${ref}`
  }
  // Purchases: a check / ACH / card payment is drawn from a separate account — "from Meezan Bank".
  if (opts.withAccount && mode !== 'cash' && mode !== 'bank' && src.walletType && src.walletType !== PAYMENT_MODE_LABELS[mode]) {
    label = `${label} · from ${src.walletType}`
  }
  const split =
    src.splitPaymentMethod === 'cash'
      ? 'Cash'
      : src.splitPaymentMethod === 'wallet' && src.splitWalletType
        ? src.splitWalletType
        : ''
  return split && Number(src.splitPaidAmount || 0) > 0 ? `${label} + ${split}` : label
}

/** Badge colours per tender, matching the invoice-type card palette. */
export const PAYMENT_MODE_BADGE: Record<PaymentMode, string> = {
  cash: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
  card: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
  ach: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300',
  check: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  bank: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
}

/**
 * The account a card / ACH / check payment to a supplier is taken from (picked automatically —
 * there is no "Paid from" box): the default bank account, then any other bank account, as long
 * as it can cover `amount`; otherwise the tender's own account (Credit Card / ACH / Check), which
 * is allowed to run below zero, so the purchase never fails on an "insufficient balance".
 */
export function defaultPayFromAccount(
  wallets: Array<{ type: string; isActive?: boolean; accountType?: string; paymentMode?: string; isDefault?: boolean; balance?: number }>,
  mode: PaymentMode,
  amount = 0,
): string | undefined {
  const usable = wallets.filter((w) => w.isActive !== false && w.accountType !== 'cash')
  const banks = usable
    .filter((w) => !w.paymentMode && w.accountType === 'bank')
    .sort((x, y) => Number(Boolean(y.isDefault)) - Number(Boolean(x.isDefault)))
  const covering = banks.find((w) => (Number(w.balance) || 0) >= amount)
  return covering?.type || usable.find((w) => w.paymentMode === mode)?.type || banks[0]?.type || usable[0]?.type
}

/** Rows for an Excel "Payment Methods" sheet (Sales / Purchase reports), with a Total line. */
export function paymentMethodSheetRows(
  rows: Array<{ label: string; invoices: number; amount: number }>,
  amountHeader: string,
  countHeader: string,
) {
  const sum = rows.reduce((total, row) => total + row.amount, 0)
  return [
    ...rows.map((row) => ({
      'Payment Method': row.label,
      [countHeader]: row.invoices,
      [amountHeader]: row.amount,
      Share: sum > 0 ? `${((row.amount / sum) * 100).toFixed(1)}%` : '0%',
    })),
    { 'Payment Method': 'Total', [countHeader]: '', [amountHeader]: sum, Share: '100%' },
  ]
}
