import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Customer credit control — server: services/creditControl.service.js, routes /credit-control.
 * Limits, temporary limits, credit hold, history, the org settings and the overview list.
 */

export type CreditStatusKey = 'ok' | 'near' | 'over' | 'hold' | 'no_limit'
export type CreditRuleReason = 'over_limit' | 'on_hold' | 'overdue'
export type CreditMode = 'block' | 'warn'

export interface CreditSettings {
  enabled: boolean
  mode: CreditMode
  includePendingInvoices: boolean
  overdueBlockDays: number
  defaultCreditLimit: number
  nearLimitPercent: number
}

export interface CreditOverdueInvoice {
  invoiceId: string
  invoiceNumber: string
  dueDate: string
  remainingAmount: number
  daysOverdue: number
}

export interface CreditStatus {
  customerId: string
  customerName: string
  enabled: boolean
  mode: CreditMode
  nearLimitPercent: number
  overdueBlockDays: number
  includePendingInvoices: boolean
  baseLimit: number
  limit: number
  hasLimit: boolean
  temporary: { amount: number; expiresAt: string; reason?: string; setAt?: string | null } | null
  onHold: boolean
  holdReason: string
  holdAt: string | null
  paymentTerms: string | null
  balance: number
  pendingAmount: number
  pendingCount: number
  exposure: number
  available: number | null
  utilization: number | null
  saleAmount: number
  projectedExposure: number
  projectedAvailable: number | null
  excess: number
  overdue: {
    count: number
    amount: number
    oldestDays: number
    blockingCount: number
    blockingAmount: number
    invoices: CreditOverdueInvoice[]
  }
  status: CreditStatusKey
  /** Only on GET /status — what the signed-in user may do about a refusal. */
  canOverride?: boolean
  canManage?: boolean
}

/** Short per-row summary (Customer Ledger list, overview). */
export interface CreditSummary {
  customerId: string
  limit: number
  baseLimit: number
  hasLimit: boolean
  temporary: CreditStatus['temporary']
  onHold: boolean
  exposure: number
  available: number | null
  utilization: number | null
  status: CreditStatusKey
}

export type CreditEventType =
  | 'limit_set'
  | 'limit_increase'
  | 'limit_decrease'
  | 'temp_limit_set'
  | 'temp_limit_cleared'
  | 'hold_on'
  | 'hold_off'
  | 'override'
  | 'warning'
  | 'offline_sale'

export interface CreditEvent {
  id: string
  type: CreditEventType
  previousLimit?: number
  newLimit?: number
  expiresAt?: string
  reason?: string
  invoiceId?: string
  invoiceNumber?: string
  saleAmount?: number
  exposure?: number
  excess?: number
  reasons?: CreditRuleReason[]
  performedByName?: string
  customerId?: string
  customerName?: string
  createdAt: string
}

export interface CreditOverviewRow extends CreditSummary {
  name: string
  nameUrdu?: string
  phone?: string
  balance: number
  holdReason: string
}

export interface CreditOverview {
  settings: CreditSettings
  totals: {
    customers: number
    totalLimit: number
    totalExposure: number
    over: number
    near: number
    hold: number
    overAmount: number
  }
  results: CreditOverviewRow[]
}

export type ChangeLimitAction = 'set' | 'increase' | 'temporary'

export type BulkCreditAction =
  | 'set'
  | 'increase'
  | 'increase_percent'
  | 'match_balance'
  | 'remove'
  | 'temporary'
  | 'clear_temporary'
  | 'hold'
  | 'release'
  | 'payment_terms'

export type BulkCreditScope = 'all' | 'no_limit' | 'with_limit' | 'receivable'

export interface BulkCreditRequest {
  customerIds?: string[]
  scope?: BulkCreditScope
  action: BulkCreditAction
  amount?: number
  percent?: number
  roundTo?: number
  expiresAt?: string
  reason?: string
  paymentTerms?: string | null
}

export interface BulkCreditResult {
  total: number
  updated: number
  skippedCount: number
  skipped: { customerId: string; name: string; reason: string }[]
}

export interface OverdueCustomerRow {
  customerId: string
  name: string
  nameUrdu?: string
  phone?: string
  balance: number
  limit: number
  paymentTerms: string | null
  onHold: boolean
  holdReason: string
  overdueCount: number
  overdueAmount: number
  oldestDays: number
}

export const creditControlApi = createApi({
  reducerPath: 'creditControlApi',
  baseQuery,
  tagTypes: ['CreditStatus', 'CreditHistory', 'CreditSettings', 'CreditOverview'],
  endpoints: (builder) => ({
    getCreditSettings: builder.query<CreditSettings, void>({
      query: () => '/credit-control/settings',
      providesTags: ['CreditSettings'],
    }),
    updateCreditSettings: builder.mutation<CreditSettings, Partial<CreditSettings>>({
      query: (body) => ({ url: '/credit-control/settings', method: 'PATCH', body }),
      invalidatesTags: ['CreditSettings', 'CreditStatus', 'CreditOverview'],
    }),
    getCustomerCreditStatus: builder.query<CreditStatus, { customerId: string; amount?: number; excludeInvoiceId?: string }>({
      query: ({ customerId, amount, excludeInvoiceId }) => ({
        url: `/credit-control/customers/${customerId}/status`,
        params: {
          ...(amount ? { amount: Math.max(0, Math.round(amount * 100) / 100) } : {}),
          ...(excludeInvoiceId ? { excludeInvoiceId } : {}),
        },
      }),
      providesTags: (_result, _error, { customerId }) => [{ type: 'CreditStatus', id: customerId }, 'CreditStatus'],
    }),
    changeCreditLimit: builder.mutation<
      CreditStatus,
      { customerId: string; action: ChangeLimitAction; amount: number; expiresAt?: string; reason?: string }
    >({
      query: ({ customerId, ...body }) => ({ url: `/credit-control/customers/${customerId}/limit`, method: 'POST', body }),
      invalidatesTags: ['CreditStatus', 'CreditHistory', 'CreditOverview'],
    }),
    clearTemporaryCreditLimit: builder.mutation<CreditStatus, { customerId: string; reason?: string }>({
      query: ({ customerId, ...body }) => ({
        url: `/credit-control/customers/${customerId}/temporary-limit/clear`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CreditStatus', 'CreditHistory', 'CreditOverview'],
    }),
    setCreditHold: builder.mutation<CreditStatus, { customerId: string; onHold: boolean; reason?: string }>({
      query: ({ customerId, ...body }) => ({ url: `/credit-control/customers/${customerId}/hold`, method: 'POST', body }),
      invalidatesTags: ['CreditStatus', 'CreditHistory', 'CreditOverview'],
    }),
    getCreditHistory: builder.query<{ results: CreditEvent[] }, { customerId: string; limit?: number }>({
      query: ({ customerId, limit }) => ({ url: `/credit-control/customers/${customerId}/history`, params: limit ? { limit } : {} }),
      providesTags: ['CreditHistory'],
    }),
    getCreditOverview: builder.query<CreditOverview, { status?: string } | void>({
      query: (args) => ({ url: '/credit-control/overview', params: args?.status ? { status: args.status } : {} }),
      providesTags: ['CreditOverview'],
    }),
    getRecentCreditOverrides: builder.query<{ results: CreditEvent[] }, { limit?: number } | void>({
      query: (args) => ({ url: '/credit-control/overrides', params: args?.limit ? { limit: args.limit } : {} }),
      providesTags: ['CreditHistory'],
    }),
    bulkUpdateCustomerCredit: builder.mutation<BulkCreditResult, BulkCreditRequest>({
      query: (body) => ({ url: '/credit-control/bulk', method: 'POST', body }),
      invalidatesTags: ['CreditStatus', 'CreditHistory', 'CreditOverview'],
    }),
    getOverdueCustomers: builder.query<
      { minDays: number; results: OverdueCustomerRow[]; totals: { customers: number; amount: number; notOnHold: number } },
      { minDays: number }
    >({
      query: ({ minDays }) => ({ url: '/credit-control/overdue-customers', params: { minDays } }),
      providesTags: ['CreditOverview'],
    }),
    exportCustomersForExcel: builder.query<{ results: import('@/features/customers/utils/customer-excel').CustomerExportRow[] }, void>({
      query: () => '/credit-control/export',
      keepUnusedDataFor: 0,
    }),
  }),
})

export const {
  useGetCreditSettingsQuery,
  useUpdateCreditSettingsMutation,
  useGetCustomerCreditStatusQuery,
  useLazyGetCustomerCreditStatusQuery,
  useChangeCreditLimitMutation,
  useClearTemporaryCreditLimitMutation,
  useSetCreditHoldMutation,
  useGetCreditHistoryQuery,
  useGetCreditOverviewQuery,
  useGetRecentCreditOverridesQuery,
  useBulkUpdateCustomerCreditMutation,
  useGetOverdueCustomersQuery,
  useLazyExportCustomersForExcelQuery,
} = creditControlApi
