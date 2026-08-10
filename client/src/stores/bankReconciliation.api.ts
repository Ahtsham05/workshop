import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { reportsApi } from './reports.api'

/** Confirming/undoing a reconciliation doesn't move any balance, but it does change what the
 *  Bank Account Statement should be able to show (a "reconciled" flag) — invalidate that
 *  cache too so it never has this session's stale reconciliation cache. Same cross-slice
 *  invalidation reasoning as `paymentVoucher.api.ts`. */
const invalidateStatementCache = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(reportsApi.util.invalidateTags(['WalletBalanceStatement']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export interface WalletEntryRecord {
  id: string
  walletType: string
  type: 'in' | 'out'
  amount: number
  referenceId: string
  referenceModel: string
  description?: string
  date: string
  isReconciled?: boolean
  reconciledAt?: string
}

export interface ReconciliationSummary {
  bankAccountId: string
  bankAccountName: string
  currentBookBalance: number
  unreconciledCount: number
  lastReconciledAt: string | null
  lastReconciledBalance: number | null
}

export interface StatementLineInput {
  date: string
  description?: string
  amount: number
  direction: 'in' | 'out'
}

export interface MatchResult {
  matches: Array<{
    statementLineIndex: number
    statementLine: StatementLineInput
    walletEntry: WalletEntryRecord & { _id?: string }
    confidence: 'exact' | 'close'
  }>
  unmatchedStatementLines: Array<{ statementLineIndex: number; statementLine: StatementLineInput }>
  unmatchedBookEntries: Array<WalletEntryRecord & { _id?: string }>
}

export interface ReconciliationSession {
  id: string
  bankAccountId: string
  bankAccountName: string
  statementStartDate?: string
  statementEndDate: string
  statementClosingBalance: number
  bookClosingBalance: number
  difference: number
  matchedCount: number
  createdAt: string
}

const withId = <T extends { id?: string; _id?: string }>(item: T) => ({
  ...item,
  id: item.id || (item._id != null ? String(item._id) : ''),
})

export const bankReconciliationApi = createApi({
  reducerPath: 'bankReconciliationApi',
  baseQuery,
  tagTypes: ['ReconciliationSummary', 'UnreconciledEntries', 'ReconciliationHistory'],
  endpoints: (builder) => ({
    getReconciliationSummary: builder.query<ReconciliationSummary, string>({
      query: (walletId) => `/bank-reconciliation/${walletId}/summary`,
      providesTags: ['ReconciliationSummary'],
    }),
    getUnreconciledEntries: builder.query<WalletEntryRecord[], { walletId: string; startDate?: string; endDate?: string }>({
      query: ({ walletId, startDate, endDate }) => ({
        url: `/bank-reconciliation/${walletId}/unreconciled`,
        params: { startDate, endDate },
      }),
      transformResponse: (response: { results: Array<WalletEntryRecord & { _id?: string }> }) =>
        (response.results || []).map(withId),
      providesTags: ['UnreconciledEntries'],
    }),
    matchStatement: builder.mutation<MatchResult, { walletId: string; statementLines: StatementLineInput[]; dateToleranceDays?: number }>({
      query: ({ walletId, ...body }) => ({ url: `/bank-reconciliation/${walletId}/match`, method: 'POST', body }),
      transformResponse: (response: MatchResult) => ({
        ...response,
        matches: response.matches.map((m) => ({ ...m, walletEntry: withId(m.walletEntry) })),
        unmatchedBookEntries: response.unmatchedBookEntries.map(withId),
      }),
    }),
    confirmReconciliation: builder.mutation<
      ReconciliationSession,
      { walletId: string; walletEntryIds: string[]; statementStartDate?: string; statementEndDate: string; statementClosingBalance: number }
    >({
      query: ({ walletId, ...body }) => ({ url: `/bank-reconciliation/${walletId}/confirm`, method: 'POST', body }),
      invalidatesTags: ['ReconciliationSummary', 'UnreconciledEntries', 'ReconciliationHistory'],
      onQueryStarted: invalidateStatementCache,
    }),
    unreconcileEntry: builder.mutation<void, string>({
      query: (walletEntryId) => ({ url: `/bank-reconciliation/entries/${walletEntryId}/unreconcile`, method: 'POST' }),
      invalidatesTags: ['ReconciliationSummary', 'UnreconciledEntries', 'ReconciliationHistory'],
      onQueryStarted: invalidateStatementCache,
    }),
    getReconciliationHistory: builder.query<ReconciliationSession[], string>({
      query: (walletId) => `/bank-reconciliation/${walletId}/history`,
      transformResponse: (response: { results: Array<ReconciliationSession & { _id?: string }> }) =>
        (response.results || []).map(withId),
      providesTags: ['ReconciliationHistory'],
    }),
  }),
})

export const {
  useGetReconciliationSummaryQuery,
  useGetUnreconciledEntriesQuery,
  useMatchStatementMutation,
  useConfirmReconciliationMutation,
  useUnreconcileEntryMutation,
  useGetReconciliationHistoryQuery,
} = bankReconciliationApi
