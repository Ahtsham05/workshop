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
  const walletOptions = wallets
    .filter((w) => w.isActive !== false)
    .map((w) => ({
      value: `${WALLET_OPTION_PREFIX}${w.type}`,
      label: formatWalletLabel(w, showBalance),
      isWallet: true,
      walletType: w.type,
    }))

  return [...baseMethods.map((m) => ({ ...m, isWallet: false })), ...walletOptions]
}

export const isWalletOptionValue = (value?: string) => Boolean(value && value.startsWith(WALLET_OPTION_PREFIX))

export const getWalletTypeFromOptionValue = (value?: string) =>
  isWalletOptionValue(value) ? String(value).slice(WALLET_OPTION_PREFIX.length) : ''

export const toWalletOptionValue = (walletType: string) => `${WALLET_OPTION_PREFIX}${walletType}`
