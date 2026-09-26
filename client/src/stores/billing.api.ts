import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { organizationApi } from './organization.api'

/** Server-side module keys — see server/src/config/billing.js MODULES. */
export type BillingModule =
  | 'invoicing'
  | 'inventory'
  | 'accounting'
  | 'reports'
  | 'advanced_reports'
  | 'hr'
  | 'mobile_shop'
  | 'school'
  | 'multi_branch'
  | 'roles_permissions'
  | 'analytics'

export const MODULE_LABELS: Record<BillingModule, string> = {
  invoicing: 'Invoicing & POS',
  inventory: 'Inventory',
  accounting: 'Accounting, wallets & ledgers',
  reports: 'Basic reports',
  advanced_reports: 'Advanced reports (P&L, ROI)',
  hr: 'HR & payroll',
  mobile_shop: 'Mobile shop modules',
  school: 'School management',
  multi_branch: 'Multi-branch management',
  roles_permissions: 'Roles & permissions',
  analytics: 'Advanced analytics',
}

/**
 * Modules left off the customer-facing plan cards. They are still real plan modules —
 * enforced by the server and switchable per plan in System Admin → Plans & Settings.
 */
export const MODULES_HIDDEN_FROM_PRICING: ReadonlySet<BillingModule> = new Set<BillingModule>(['school'])

export type SubscriptionStatus = 'trialing' | 'active' | 'pastDue' | 'gracePeriod' | 'canceled' | 'expired'
export type PaymentSource = 'manual' | 'polar'
export type ManualMethod = 'bank_transfer' | 'jazzcash' | 'easypaisa'

export const METHOD_LABELS: Record<ManualMethod, string> = {
  bank_transfer: 'Bank transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
}

export interface PlanLimits {
  maxUsers: number
  maxInvoicesPerMonth: number
  maxBranches: number
}

export interface BillingPlan {
  key: string
  name: string
  description: string
  badge: string | null
  priceUsdMonthly: number
  pricePkrMonthly: number
  limits: PlanLimits
  modules: BillingModule[]
  cardAvailable: boolean
}

export interface BillingSummary {
  plan: { key: string; name: string; priceUsdMonthly: number; limits: PlanLimits; modules: BillingModule[] }
  status: SubscriptionStatus
  mode: 'full' | 'readOnly'
  paymentSource: PaymentSource | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  daysRemaining: number | null
  cancelAtPeriodEnd: boolean
  pendingPlan: { key: string; name: string; effectiveAt: string } | null
  usage: { users: number; branches: number; invoicesThisMonth: number }
  routing: { country: string | null; allowed: PaymentSource[]; default: PaymentSource | null }
  readOnlyReason: string | null
  isOwner: boolean
  hasCardSubscription: boolean
  pkrPerUsd: number
  plans: BillingPlan[]
}

export interface LimitOverage {
  limit: keyof PlanLimits
  used: number
  allowed: number
  message: string
}

export interface PlanChangePreview {
  direction: 'upgrade' | 'downgrade' | 'same'
  from: { key: string; name: string }
  to: { key: string; name: string }
  effectiveAt: string
  warnings: LimitOverage[]
}

export interface PaymentDetails {
  bank: { bankName: string; accountTitle: string; accountNumber: string; iban: string; branch: string }
  jazzcash: { accountTitle: string; accountNumber: string }
  easypaisa: { accountTitle: string; accountNumber: string }
  pkrPerUsd: number
}

export interface ManualIntent {
  reference: string
  plan: { key: string; name: string; priceUsdMonthly: number }
  months: number
  usdAmount: number
  pkrPerUsd: number
  amountPkr: number
  expiresAt: string
  paymentDetails: PaymentDetails
  direction: 'upgrade' | 'downgrade' | 'same'
  warnings: LimitOverage[]
}

export interface ManualPayment {
  id: string
  organizationId: string | { id: string; name: string; email?: string; countryCode?: string }
  submittedBy: string | { id: string; name: string; email: string }
  reference: string
  planKey: string
  months: number
  usdAmount: number
  pkrPerUsd: number
  amountPkr: number
  paidAmountPkr: number
  method: ManualMethod
  transactionId: string
  payerName: string
  paidOn: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: { id: string; name: string; email: string } | string | null
  reviewedAt?: string | null
  rejectionReason?: string | null
  receiptNumber?: string | null
  appliedAs?: 'new' | 'renewal' | 'upgrade' | 'scheduledDowngrade' | null
  appliedPeriodStart?: string | null
  appliedPeriodEnd?: string | null
  proof?: { mimeType: string; bytes: number }
  proofUrl?: string
  proofUrlExpiresInSeconds?: number
  amountMismatch?: boolean
  createdAt: string
}

export interface Page<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface BillingSettings {
  pkrPerUsd: number
  graceDays: number
  reminderDays: number[]
  intentTtlHours: number
  bank: PaymentDetails['bank']
  jazzcash: PaymentDetails['jazzcash']
  easypaisa: PaymentDetails['easypaisa']
  updatedAt?: string
}

export interface AdminPlan extends Omit<BillingPlan, 'pricePkrMonthly' | 'cardAvailable'> {
  id: string
  isPublic: boolean
  isActive: boolean
  sortOrder: number
  polar: { sandboxProductId: string | null; productionProductId: string | null }
}

/** Machine-readable error codes the billing/entitlement layer returns (see server entitlement.service). */
export type BillingErrorCode =
  | 'SUBSCRIPTION_READ_ONLY'
  | 'MODULE_NOT_IN_PLAN'
  | 'LIMIT_USERS'
  | 'LIMIT_BRANCHES'
  | 'LIMIT_INVOICES'
  | 'DUPLICATE_TRANSACTION'
  | 'REFERENCE_EXPIRED'
  | 'REFERENCE_USED'
  | 'POLAR_SUBSCRIPTION_EXISTS'
  | 'NOT_ORG_OWNER'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'

/** RTK Query errors are not toasted globally — callers show this message themselves. */
export function billingErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = (err as { data?: { message?: string } } | undefined)?.data
  return data?.message || fallback
}

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery,
  tagTypes: ['Summary', 'MyManualPayments', 'AdminManualPayments', 'AdminSettings', 'AdminPlans'],
  endpoints: (builder) => ({
    getBillingSummary: builder.query<BillingSummary, void>({
      query: () => '/billing/summary',
      providesTags: ['Summary'],
    }),
    previewPlanChange: builder.mutation<PlanChangePreview, { planKey: string }>({
      query: (body) => ({ url: '/billing/plan-change/preview', method: 'POST', body }),
    }),
    createCheckout: builder.mutation<{ url: string; checkoutId: string }, { planKey: string }>({
      query: (body) => ({ url: '/billing/polar/checkout', method: 'POST', body }),
    }),
    createPortalSession: builder.mutation<{ url: string }, void>({
      query: () => ({ url: '/billing/polar/portal', method: 'POST' }),
    }),
    changeCardPlan: builder.mutation<
      { direction: 'upgrade' | 'downgrade'; effectiveAt: string; warnings: LimitOverage[] },
      { planKey: string }
    >({
      query: (body) => ({ url: '/billing/polar/change-plan', method: 'POST', body }),
      invalidatesTags: ['Summary'],
    }),
    createManualIntent: builder.mutation<ManualIntent, { planKey: string; months: number }>({
      query: (body) => ({ url: '/billing/manual/intents', method: 'POST', body }),
    }),
    submitManualPayment: builder.mutation<ManualPayment, FormData>({
      query: (body) => ({ url: '/billing/manual/payments', method: 'POST', body }),
      invalidatesTags: ['MyManualPayments', 'Summary'],
    }),
    getMyManualPayments: builder.query<Page<ManualPayment>, { page?: number } | void>({
      query: (params) => ({ url: '/billing/manual/payments', params: params || {} }),
      providesTags: ['MyManualPayments'],
    }),

    // ── Platform admin ──
    adminListManualPayments: builder.query<
      Page<ManualPayment>,
      { status?: string; method?: string; search?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/billing/admin/manual-payments', params }),
      providesTags: ['AdminManualPayments'],
    }),
    adminGetManualPayment: builder.query<ManualPayment, string>({
      query: (id) => `/billing/admin/manual-payments/${id}`,
      // The proof URL expires — never serve it from cache.
      keepUnusedDataFor: 0,
    }),
    adminApproveManualPayment: builder.mutation<ManualPayment, string>({
      query: (id) => ({ url: `/billing/admin/manual-payments/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['AdminManualPayments'],
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        await queryFulfilled
        dispatch(organizationApi.util.invalidateTags(['Organization']))
      },
    }),
    adminRejectManualPayment: builder.mutation<ManualPayment, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/billing/admin/manual-payments/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['AdminManualPayments'],
    }),
    adminGetBillingSettings: builder.query<BillingSettings, void>({
      query: () => '/billing/admin/settings',
      providesTags: ['AdminSettings'],
    }),
    adminUpdateBillingSettings: builder.mutation<BillingSettings, Partial<BillingSettings>>({
      query: (body) => ({ url: '/billing/admin/settings', method: 'PATCH', body }),
      invalidatesTags: ['AdminSettings'],
    }),
    adminListPlans: builder.query<AdminPlan[], void>({
      query: () => '/billing/admin/plans',
      providesTags: ['AdminPlans'],
    }),
    adminUpdatePlan: builder.mutation<AdminPlan, { key: string; changes: Partial<AdminPlan> }>({
      query: ({ key, changes }) => ({ url: `/billing/admin/plans/${key}`, method: 'PATCH', body: changes }),
      invalidatesTags: ['AdminPlans', 'Summary'],
    }),
  }),
})

export const {
  useGetBillingSummaryQuery,
  usePreviewPlanChangeMutation,
  useCreateCheckoutMutation,
  useCreatePortalSessionMutation,
  useChangeCardPlanMutation,
  useCreateManualIntentMutation,
  useSubmitManualPaymentMutation,
  useGetMyManualPaymentsQuery,
  useAdminListManualPaymentsQuery,
  useAdminGetManualPaymentQuery,
  useAdminApproveManualPaymentMutation,
  useAdminRejectManualPaymentMutation,
  useAdminGetBillingSettingsQuery,
  useAdminUpdateBillingSettingsMutation,
  useAdminListPlansQuery,
  useAdminUpdatePlanMutation,
} = billingApi
