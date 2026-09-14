import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { invalidateWalletCaches } from './wallet-cache-invalidation'
import { invoiceApi } from './invoice.api'

/**
 * Recording a customer payment moves a Bank Account / the cash till AND changes how much
 * every invoice it touched still owes. Both live in other RTK Query slices, so every
 * mutation here has to invalidate them explicitly — `invalidateWalletCaches` covers the
 * Bank Accounts / Cash Book / Statement / Reconciliation screens, and the Invoice tag
 * covers the invoice list's paid/remaining columns.
 */
const invalidateMoneyAndInvoices = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(invoiceApi.util.invalidateTags(['Invoice']))
    invalidateWalletCaches(dispatch)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export type AllocationMode = 'fifo' | 'due_date' | 'manual' | 'reference' | 'none'
/** 'return_credit' carries no cash — goods came back, so the invoice is worth less. */
export type PaymentDirection = 'payment' | 'refund' | 'return_credit'
export type SettlementStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid'
export type DueStatus = 'overdue' | 'due_today' | 'due_soon' | 'not_due' | 'no_due_date' | 'settled'

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

/** One still-owed invoice, as the allocation preview sees it. */
export interface OpenInvoice {
  id: string
  _id?: string
  invoiceNumber: string
  billNumber?: string
  invoiceDate: string
  dueDate?: string | null
  total: number
  paidAmount: number
  allocatedAmount?: number
  settledAmount: number
  remainingAmount: number
  settlementStatus: SettlementStatus
  dueStatus: DueStatus
  itemsCount?: number
  /** Filled by the preview endpoint: what this payment would put against this invoice. */
  appliedAmount?: number
  outstandingAfter?: number
  statusAfter?: 'paid' | 'partial' | 'outstanding'
}

export interface CustomerAccountSummary {
  invoiceCount: number
  openInvoiceCount: number
  overdueInvoiceCount: number
  totalBilled: number
  totalSettled: number
  totalOutstanding: number
  overdueAmount: number
  availableCredit: number
}

export interface PaymentAllocation {
  id?: string
  invoice: string
  invoiceNumber: string
  invoiceDate?: string
  dueDate?: string | null
  invoiceTotal: number
  outstandingBefore: number
  amount: number
  appliedAt?: string
}

export interface AllocationPreview {
  openInvoices: OpenInvoice[]
  allocations: PaymentAllocation[]
  allocatedTotal: number
  unappliedAmount: number
  summary: CustomerAccountSummary
  outstandingAfter: number
}

export interface CustomerPaymentHistoryEntry {
  id?: string
  action: 'created' | 'allocated' | 'reallocated' | 'credit_applied' | 'voided' | 'refunded'
  at: string
  byName?: string
  details?: string
  amount?: number
}

export interface CustomerPaymentRecord {
  id: string
  _id?: string
  paymentNumber: string
  customer: { id?: string; _id?: string; name: string; nameUrdu?: string; phone?: string; picture?: { url?: string } } | string
  customerName?: string
  direction: PaymentDirection
  paymentDate: string
  amount: number
  paymentMethod: 'cash' | 'wallet'
  walletType?: string
  referenceNumber?: string
  notes?: string
  allocationMode: AllocationMode
  allocations: PaymentAllocation[]
  allocatedTotal: number
  unappliedAmount: number
  status: 'posted' | 'void'
  voidReason?: string
  voidedAt?: string
  history: CustomerPaymentHistoryEntry[]
  createdBy?: { name?: string; email?: string } | string
  createdAt: string
}

/** Payment history for one invoice (the view drawer's Payment History tab). */
export interface InvoiceSettlementDetail {
  settledAmount: number
  remainingAmount: number
  settlementStatus: SettlementStatus
  dueStatus: DueStatus
  paidAtSale: number
  payments: {
    id: string
    paymentNumber: string
    paymentDate: string
    amount: number
    appliedToThisInvoice: number
    paymentMethod: 'cash' | 'wallet'
    walletType?: string
    referenceNumber?: string
    notes?: string
    status: 'posted' | 'void'
    direction: PaymentDirection
    createdBy?: { name?: string; email?: string } | string
  }[]
}

/**
 * Why the Customer Ledger's balance and the invoice list's outstanding total differ — see
 * customerPayment.service.js's getCustomerReconciliation. Leaner than SupplierReconciliation:
 * no contra-credit bucket, since no shadow-customer account concept exists on this side. The
 * identity always holds: invoiceOutstanding − unallocatedPayments − returnCredits −
 * availableCredit − unexplained = ledgerBalance.
 */
export interface CustomerReconciliation {
  invoiceCount: number
  openInvoiceCount: number
  invoiceOutstanding: number
  ledgerBalance: number
  availableCredit: number
  /** Money paid on the ledger that no invoice has been credited with — fixable. */
  unallocatedPayments: number
  unallocatedPaymentCount: number
  /** Sales returns whose credit never reached their invoice — fixable. */
  returnCredits: number
  returnCount: number
  /** Returns already credited to their invoice — reported for transparency, not a gap. */
  appliedReturnCredits: number
  unexplained: number
  /** What the one-click repair can still settle: unallocatedPayments + returnCredits. */
  fixableAmount: number
  isReconciled: boolean
}

export interface CreateCustomerPaymentRequest {
  customer: string
  amount: number
  direction?: PaymentDirection
  paymentDate?: string
  paymentMethod?: 'cash' | 'wallet'
  walletType?: string
  referenceNumber?: string
  notes?: string
  allocationMode?: AllocationMode
  /** Manual mode only — one line per invoice the user typed an amount against. */
  allocations?: { invoiceId: string; amount: number }[]
  invoiceIds?: string[]
}

export const customerPaymentApi = createApi({
  reducerPath: 'customerPaymentApi',
  baseQuery,
  tagTypes: ['CustomerPayment', 'CustomerAccount'],
  endpoints: (builder) => ({
    getCustomerPayments: builder.query<
      PaginatedResult<CustomerPaymentRecord>,
      { customer?: string; status?: string; direction?: string; search?: string; startDate?: string; endDate?: string; page?: number; limit?: number } | void
    >({
      query: (params) => ({ url: '/customer-payments', params: { limit: 20, ...(params || {}) } }),
      providesTags: ['CustomerPayment'],
    }),

    getCustomerPayment: builder.query<CustomerPaymentRecord, string>({
      query: (id) => `/customer-payments/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'CustomerPayment', id }],
    }),

    /** Every payment that has touched one invoice, plus its settlement snapshot. */
    getInvoicePayments: builder.query<InvoiceSettlementDetail, string>({
      query: (invoiceId) => `/customer-payments/invoice/${invoiceId}`,
      providesTags: (_r, _e, invoiceId) => [{ type: 'CustomerPayment', id: `invoice-${invoiceId}` }],
    }),

    getOpenInvoices: builder.query<{ results: OpenInvoice[] }, { customerId: string; strategy?: 'fifo' | 'due_date' }>({
      query: ({ customerId, strategy }) => ({
        url: `/customer-payments/customer/${customerId}/open-invoices`,
        params: strategy ? { strategy } : undefined,
      }),
      providesTags: ['CustomerAccount'],
    }),

    getCustomerAccountSummary: builder.query<CustomerAccountSummary, string>({
      query: (customerId) => `/customer-payments/customer/${customerId}/summary`,
      providesTags: (_r, _e, customerId) => [{ type: 'CustomerAccount', id: customerId }],
    }),

    getCustomerReconciliation: builder.query<CustomerReconciliation, string>({
      query: (customerId) => `/customer-payments/customer/${customerId}/reconciliation`,
      providesTags: (_r, _e, customerId) => [{ type: 'CustomerAccount', id: `reconciliation-${customerId}` }],
    }),

    /**
     * One-click repair for a legacy account: applies ledger "Cash Received" rows and sales
     * returns that never reached an invoice. Moves no money, and is idempotent.
     */
    repairCustomerAllocations: builder.mutation<
      {
        appliedCount: number
        paymentCount: number
        returnCount: number
        appliedTotal: number
        payments: { paymentNumber: string; amount: number; allocatedTotal: number; unappliedAmount: number; invoices: string[] }[]
        reconciliation: CustomerReconciliation
      },
      string
    >({
      query: (customerId) => ({ url: `/customer-payments/customer/${customerId}/repair-allocations`, method: 'POST' }),
      invalidatesTags: ['CustomerPayment', 'CustomerAccount'],
      onQueryStarted: invalidateMoneyAndInvoices,
    }),

    /**
     * Dry-run allocation. A mutation rather than a query because it POSTs the manual
     * allocation array — it changes nothing server-side, and the dialog calls it on every
     * amount/mode change to show which invoices the money would clear.
     */
    previewAllocation: builder.mutation<
      AllocationPreview,
      { customer: string; amount: number; allocationMode?: AllocationMode; allocations?: { invoiceId: string; amount: number }[]; invoiceIds?: string[] }
    >({
      query: (body) => ({ url: '/customer-payments/preview', method: 'POST', body }),
    }),

    createCustomerPayment: builder.mutation<CustomerPaymentRecord, CreateCustomerPaymentRequest>({
      query: (body) => ({ url: '/customer-payments', method: 'POST', body }),
      invalidatesTags: ['CustomerPayment', 'CustomerAccount'],
      onQueryStarted: invalidateMoneyAndInvoices,
    }),

    /** Put a customer's unapplied credit against their open invoices — no new cash moves. */
    applyCredit: builder.mutation<
      { appliedAmount: number; allocations: PaymentAllocation[]; remainingCredit: number },
      { customer: string; amount?: number; allocationMode?: 'fifo' | 'due_date' | 'manual'; allocations?: { invoiceId: string; amount: number }[] }
    >({
      query: (body) => ({ url: '/customer-payments/apply-credit', method: 'POST', body }),
      invalidatesTags: ['CustomerPayment', 'CustomerAccount'],
      onQueryStarted: invalidateMoneyAndInvoices,
    }),

    voidCustomerPayment: builder.mutation<CustomerPaymentRecord, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/customer-payments/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: ['CustomerPayment', 'CustomerAccount'],
      onQueryStarted: invalidateMoneyAndInvoices,
    }),

    reallocateCustomerPayment: builder.mutation<
      CustomerPaymentRecord,
      { id: string; allocationMode?: 'fifo' | 'due_date' | 'manual'; allocations?: { invoiceId: string; amount: number }[] }
    >({
      query: ({ id, ...body }) => ({ url: `/customer-payments/${id}/reallocate`, method: 'POST', body }),
      invalidatesTags: ['CustomerPayment', 'CustomerAccount'],
      onQueryStarted: invalidateMoneyAndInvoices,
    }),
  }),
})

export const {
  useGetCustomerPaymentsQuery,
  useGetCustomerPaymentQuery,
  useGetInvoicePaymentsQuery,
  useGetOpenInvoicesQuery,
  useGetCustomerAccountSummaryQuery,
  useGetCustomerReconciliationQuery,
  useRepairCustomerAllocationsMutation,
  usePreviewAllocationMutation,
  useCreateCustomerPaymentMutation,
  useApplyCreditMutation,
  useVoidCustomerPaymentMutation,
  useReallocateCustomerPaymentMutation,
} = customerPaymentApi
