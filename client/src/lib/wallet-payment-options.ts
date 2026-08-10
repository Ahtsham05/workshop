/**
 * Shared helper for merging wallets directly into a payment-method dropdown
 * (Cash, Bank Transfer, Card, ... JazzCash, My Bank Account, ...) instead of
 * showing a separate "Select Wallet" box. Used by Invoice, Purchase, Expense
 * and Ledger Entry forms.
 */

export const WALLET_OPTION_PREFIX = 'wallet:'

export interface WalletLike {
  id?: string
  type: string
  balance?: number
  isActive?: boolean
  accountType?: 'cash' | 'bank' | 'mobile_wallet'
}

export interface MergedPaymentOption {
  value: string
  label: string
  isWallet: boolean
  walletType?: string
}

const formatWalletLabel = (wallet: WalletLike, showBalance: boolean) => {
  if (!showBalance) return wallet.type
  const balance = Number(wallet.balance || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })
  return `${wallet.type} (Rs ${balance})`
}

/**
 * Merge plain payment methods (Cash, Bank Transfer, ...) with active wallets
 * into a single flat list of dropdown options.
 *
 * The user's "Cash in Hand" account (`accountType === 'cash'`) is deliberately never
 * listed as its own selectable `wallet:` row — every money-in/money-out sync service in
 * this app (Invoice, Purchase, RepairJob, BillPayment, ...) treats `paymentMethod:'wallet'`
 * as "not cash" and skips Cash Book entirely, by design, so real digital wallets (JazzCash,
 * EasyPaisa) don't double-count. Selecting Cash in Hand through that path would silently
 * vanish from Cash Book. Instead, whichever base option represents plain cash (value
 * `'cash'`/`'Cash'`) is relabeled with the real Cash in Hand account's name (and balance,
 * when `showBalance`) so it reads as a first-class named account while its wire value
 * stays the safe, Cash-Book-synced `'cash'`.
 *
 * @param showBalance Show the wallet's current balance next to its name.
 *   Pass `true` only on money-out forms (purchase, expense, supplier payment)
 *   where the balance is relevant; pass `false` on money-in forms (sale,
 *   customer payment received).
 */
export function buildMergedPaymentOptions(
  baseMethods: { value: string; label: string }[],
  wallets: WalletLike[],
  showBalance: boolean,
): MergedPaymentOption[] {
  const activeWallets = wallets.filter((w) => w.isActive !== false)
  const cashWallet = activeWallets.find((w) => w.accountType === 'cash')

  const baseOptions = baseMethods.map((m) => {
    if (cashWallet && m.value.toLowerCase() === 'cash') {
      return { ...m, label: formatWalletLabel(cashWallet, showBalance), isWallet: false }
    }
    return { ...m, isWallet: false }
  })

  const walletOptions = activeWallets
    .filter((w) => w.accountType !== 'cash')
    .map((w) => ({
      value: `${WALLET_OPTION_PREFIX}${w.type}`,
      label: formatWalletLabel(w, showBalance),
      isWallet: true,
      walletType: w.type,
    }))

  return [...baseOptions, ...walletOptions]
}

export const isWalletOptionValue = (value?: string) => Boolean(value && value.startsWith(WALLET_OPTION_PREFIX))

export const getWalletTypeFromOptionValue = (value?: string) =>
  isWalletOptionValue(value) ? String(value).slice(WALLET_OPTION_PREFIX.length) : ''

export const toWalletOptionValue = (walletType: string) => `${WALLET_OPTION_PREFIX}${walletType}`
