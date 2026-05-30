/** API / DB values — do not change without a backend migration */
export type CashTransactionType = 'withdrawal' | 'deposit'

/** User-facing: withdrawal → Received, deposit → Send */
export function cashTxLabel(type: CashTransactionType): 'Received' | 'Send' {
  return type === 'withdrawal' ? 'Received' : 'Send'
}

export function cashTxLabelLower(type: CashTransactionType): string {
  return cashTxLabel(type).toLowerCase()
}

export function cashTxEntriesLabel(type: CashTransactionType): string {
  return `${cashTxLabel(type)} entries`
}

export function cashSendCommissionBadge(rate: number): string {
  return `Send ${Number(rate).toFixed(2)}%`
}

export function cashReceivedCommissionBadge(rate: number): string {
  return `Received ${Number(rate).toFixed(2)}%`
}

export const CASH_MANAGEMENT_PAGE_HINT = 'Manage cash received and send'
export const CASH_WALLET_ACTION_HINT = 'Choose a cash wallet and action (received or send)'
export const CASH_WALLET_RATES_SECTION = 'Cash Received / Send Rates'
export const CASH_SEND_COMMISSION_LABEL = 'Send Commission (%)'
export const CASH_RECEIVED_COMMISSION_LABEL = 'Received Commission (%)'
