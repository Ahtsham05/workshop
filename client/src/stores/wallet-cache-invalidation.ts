import { mobileShopApi } from './mobile-shop.api'
import { reportsApi } from './reports.api'
import { bankReconciliationApi } from './bankReconciliation.api'

/**
 * Every RTK Query mutation that moves a Bank Account's balance or posts a Cash Book entry
 * server-side — Invoice, Purchase, Payment Voucher, Receipt Voucher, and whatever comes
 * next — lives in its own separate API slice from the caches that display that data: the
 * Bank Accounts page and Cash Book (`mobileShopApi`), the Bank Account Statement and the
 * Bank & Cash Position / Reconciliation History report tab (`reportsApi`), and the Bank
 * Reconciliation workspace (`bankReconciliationApi`). RTK Query's tag invalidation is
 * scoped per slice (per `reducerPath`), not global, so none of those refresh just because
 * the tag names happen to match — each mutation has to invalidate all three slices itself,
 * explicitly, or the affected pages keep showing whatever was cached until an unrelated
 * action happens to refetch them (or the user reloads the page).
 *
 * Call this from every such mutation's `onQueryStarted`, after `await queryFulfilled`. See
 * the Bank Accounts & Payments Roadmap memory (module 2g and the "fix this thing deeply"
 * follow-up) for the history of this exact bug recurring one mutation at a time.
 */
export const invalidateWalletCaches = (dispatch: (action: unknown) => unknown) => {
  dispatch(mobileShopApi.util.invalidateTags(['Wallets', 'CashBook', 'MobileDashboard']))
  dispatch(reportsApi.util.invalidateTags(['WalletBalanceStatement', 'BankPositionReport', 'BankReconciliationSessionsReport']))
  dispatch(bankReconciliationApi.util.invalidateTags(['ReconciliationSummary', 'UnreconciledEntries']))
}
