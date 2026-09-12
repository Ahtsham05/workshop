import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { invalidateWalletCaches } from './wallet-cache-invalidation'
import { purchaseApi } from './purchase.api'

/**
 * Recording a supplier payment moves a Bank Account / the cash till AND changes how much
 * every invoice it touched still owes. Both live in other RTK Query slices, so every
 * mutation here has to invalidate them explicitly — `invalidateWalletCaches` covers the
 * Bank Accounts / Cash Book / Statement / Reconciliation screens, and the Purchase tag
 * covers the purchase list's paid/remaining columns.
 */
const invalidateMoneyAndPurchases = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(purchaseApi.util.invalidateTags(['Purchase']))
    invalidateWalletCaches(dispatch)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export type AllocationMode = 'fifo' | 'due_date' | 'manual' | 'reference' | 'none'
/** 'return_credit' carries no cash — goods went back, so the invoice is worth less. */
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
  vendorBillNumber?: string
  purchaseDate: string
  dueDate?: string | null
  totalAmount: number
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

export interface SupplierAccountSummary {
  invoiceCount: number
  openInvoiceCount: number
  overdueInvoiceCount: number
  totalPurchased: number
  totalSettled: number
  totalOutstanding: number
  overdueAmount: number
  availableCredit: number
}

/**
 * Why the supplier ledger's balance and the purchase list's outstanding total differ — see
 * supplierPayment.service.js's getSupplierReconciliation. The identity always holds:
 * invoiceOutstanding − unallocatedPayments − availableCredit − contraCredits −
 * returnCredits − unexplained = ledgerBalance.
 */
export interface SupplierReconciliation {
  invoiceOutstanding: number
  ledgerBalance: number
  /** Supplier.balance as stored — recalculated before this response, so it always matches. */
  storedBalance: number
  invoiceCount: number
  openInvoiceCount: number
  totalPurchased: number
  /** Money paid on the ledger that no invoice has been credited with — fixable. */
  unallocatedPayments: number
  unallocatedPaymentCount: number
  availableCredit: number
  /** Debit notes: value this supplier owes us, netted off the balance but not off any bill. */
  contraCredits: number
  contraCount: number
  /** Purchase returns whose credit never reached their invoice — fixable. */
  returnCredits: number
  returnCount: number
  /** Returns already credited to their invoice — reported for transparency, not a gap. */
  appliedReturnCredits: number
  /** Recorded against an invoice beyond what it was worth — needs a human decision. */
  invoiceOverpayment: number
  overpaidInvoiceCount: number
  /** Up to five invoice numbers carrying that excess, so the user can go straight to them. */
  overpaidInvoices: string[]
  /** Purchase ledger rows that disagree with the invoices they mirror. Not fixable by allocation. */
  ledgerDrift: number
  residual: number
  unexplained: number
  /** What the one-click repair can still settle: unallocatedPayments + returnCredits. */
  fixableAmount: number
  isReconciled: boolean
}

export interface PaymentAllocation {
  id?: string
  purchase: string
  invoiceNumber: string
  purchaseDate?: string
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
  summary: SupplierAccountSummary
  outstandingAfter: number
}

export interface SupplierPaymentHistoryEntry {
  id?: string
  action: 'created' | 'allocated' | 'reallocated' | 'credit_applied' | 'voided' | 'refunded'
  at: string
  byName?: string
  details?: string
  amount?: number
}

export interface SupplierPaymentRecord {
  id: string
  _id?: string
  paymentNumber: string
  supplier: { id?: string; _id?: string; name: string; nameUrdu?: string; phone?: string; picture?: { url?: string } } | string
  supplierName?: string
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
  history: SupplierPaymentHistoryEntry[]
  createdBy?: { name?: string; email?: string } | string
  createdAt: string
}

/** Payment history for one purchase invoice (the view drawer's Payment History tab). */
export interface PurchaseSettlementDetail {
  settledAmount: number
  remainingAmount: number
  settlementStatus: SettlementStatus
  dueStatus: DueStatus
  paidAtPurchase: number
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

export interface CreateSupplierPaymentRequest {
  supplier: string
  amount: number
  direction?: PaymentDirection
  paymentDate?: string
  paymentMethod?: 'cash' | 'wallet'
  walletType?: string
  referenceNumber?: string
  notes?: string
  allocationMode?: AllocationMode
  /** Manual mode only — one line per invoice the user typed an amount against. */
  allocations?: { purchaseId: string; amount: number }[]
  purchaseIds?: string[]
}

export const supplierPaymentApi = createApi({
  reducerPath: 'supplierPaymentApi',
  baseQuery,
  tagTypes: ['SupplierPayment', 'SupplierAccount'],
  endpoints: (builder) => ({
    getSupplierPayments: builder.query<
      PaginatedResult<SupplierPaymentRecord>,
      { supplier?: string; status?: string; direction?: string; search?: string; startDate?: string; endDate?: string; page?: number; limit?: number } | void
    >({
      query: (params) => ({ url: '/supplier-payments', params: { limit: 20, ...(params || {}) } }),
      providesTags: ['SupplierPayment'],
    }),

    getSupplierPayment: builder.query<SupplierPaymentRecord, string>({
      query: (id) => `/supplier-payments/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'SupplierPayment', id }],
    }),

    /** Every payment that has touched one purchase invoice, plus its settlement snapshot. */
    getPurchasePayments: builder.query<PurchaseSettlementDetail, string>({
      query: (purchaseId) => `/supplier-payments/purchase/${purchaseId}`,
      providesTags: (_r, _e, purchaseId) => [{ type: 'SupplierPayment', id: `purchase-${purchaseId}` }],
    }),

    getOpenInvoices: builder.query<{ results: OpenInvoice[] }, { supplierId: string; strategy?: 'fifo' | 'due_date' }>({
      query: ({ supplierId, strategy }) => ({
        url: `/supplier-payments/supplier/${supplierId}/open-invoices`,
        params: strategy ? { strategy } : undefined,
      }),
      providesTags: ['SupplierAccount'],
    }),

    getSupplierAccountSummary: builder.query<SupplierAccountSummary, string>({
      query: (supplierId) => `/supplier-payments/supplier/${supplierId}/summary`,
      providesTags: (_r, _e, supplierId) => [{ type: 'SupplierAccount', id: supplierId }],
    }),

    getSupplierReconciliation: builder.query<SupplierReconciliation, string>({
      query: (supplierId) => `/supplier-payments/supplier/${supplierId}/reconciliation`,
      providesTags: (_r, _e, supplierId) => [{ type: 'SupplierAccount', id: `reconciliation-${supplierId}` }],
    }),

    /**
     * One-click repair for a legacy account: applies ledger payments and purchase-return
     * credits that never reached an invoice. Moves no money, and is idempotent.
     */
    repairSupplierAllocations: builder.mutation<
      {
        appliedCount: number
        paymentCount: number
        returnCount: number
        appliedTotal: number
        payments: { paymentNumber: string; amount: number; allocatedTotal: number; unappliedAmount: number; invoices: string[] }[]
        reconciliation: SupplierReconciliation
      },
      string
    >({
      query: (supplierId) => ({ url: `/supplier-payments/supplier/${supplierId}/repair-allocations`, method: 'POST' }),
      invalidatesTags: ['SupplierPayment', 'SupplierAccount'],
      onQueryStarted: invalidateMoneyAndPurchases,
    }),

    /**
     * Dry-run allocation. A mutation rather than a query because it POSTs the manual
     * allocation array — it changes nothing server-side, and the dialog calls it on every
     * amount/mode change to show which invoices the money would clear.
     */
    previewAllocation: builder.mutation<
      AllocationPreview,
      { supplier: string; amount: number; allocationMode?: AllocationMode; allocations?: { purchaseId: string; amount: number }[]; purchaseIds?: string[] }
    >({
      query: (body) => ({ url: '/supplier-payments/preview', method: 'POST', body }),
    }),

    createSupplierPayment: builder.mutation<SupplierPaymentRecord, CreateSupplierPaymentRequest>({
      query: (body) => ({ url: '/supplier-payments', method: 'POST', body }),
      invalidatesTags: ['SupplierPayment', 'SupplierAccount'],
      onQueryStarted: invalidateMoneyAndPurchases,
    }),

    /** Put a supplier's unapplied credit against their open invoices — no new cash moves. */
    applyCredit: builder.mutation<
      { appliedAmount: number; allocations: PaymentAllocation[]; remainingCredit: number },
      { supplier: string; amount?: number; allocationMode?: 'fifo' | 'due_date' | 'manual'; allocations?: { purchaseId: string; amount: number }[] }
    >({
      query: (body) => ({ url: '/supplier-payments/apply-credit', method: 'POST', body }),
      invalidatesTags: ['SupplierPayment', 'SupplierAccount'],
      onQueryStarted: invalidateMoneyAndPurchases,
    }),

    voidSupplierPayment: builder.mutation<SupplierPaymentRecord, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/supplier-payments/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: ['SupplierPayment', 'SupplierAccount'],
      onQueryStarted: invalidateMoneyAndPurchases,
    }),

    reallocateSupplierPayment: builder.mutation<
      SupplierPaymentRecord,
      { id: string; allocationMode?: 'fifo' | 'due_date' | 'manual'; allocations?: { purchaseId: string; amount: number }[] }
    >({
      query: ({ id, ...body }) => ({ url: `/supplier-payments/${id}/reallocate`, method: 'POST', body }),
      invalidatesTags: ['SupplierPayment', 'SupplierAccount'],
      onQueryStarted: invalidateMoneyAndPurchases,
    }),
  }),
})

export const {
  useGetSupplierPaymentsQuery,
  useGetSupplierPaymentQuery,
  useGetPurchasePaymentsQuery,
  useGetOpenInvoicesQuery,
  useGetSupplierAccountSummaryQuery,
  useGetSupplierReconciliationQuery,
  useRepairSupplierAllocationsMutation,
  usePreviewAllocationMutation,
  useCreateSupplierPaymentMutation,
  useApplyCreditMutation,
  useVoidSupplierPaymentMutation,
  useReallocateSupplierPaymentMutation,
} = supplierPaymentApi
