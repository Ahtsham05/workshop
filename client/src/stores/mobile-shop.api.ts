import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface WalletRecord {
  id: string
  type: string
  balance: number
  isActive: boolean
  commissionRate: number
  withdrawalCommissionRate: number
  depositCommissionRate: number
  updatedAt?: string
}

export interface LoadPurchaseRecord {
  id: string
  walletType: string
  amount: number
  supplierName?: string
  paymentMethod: 'cash' | 'bank'
  commissionRate: number
  extraCharge: number
  profit: number
  date: string
}

export interface LoadTransactionRecord {
  id: string
  type: 'normal' | 'package'
  walletType: string
  walletId?: string
  network: string
  mobileNumber: string
  amount: number
  commissionRate: number
  extraCharge: number
  profit: number
  paymentMethod: 'cash' | 'wallet'
  date: string
}

export interface CreateLoadTransactionInput {
  type: 'normal' | 'package'
  walletType: string
  walletId: string
  network: string
  mobileNumber: string
  amount: number
  commissionRate: number
  extraCharge: number
  paymentMethod: 'cash' | 'wallet'
  date: string
}

export interface CashWithdrawalRecord {
  id: string
  walletId: string
  walletType: string
  amount: number
  transactionType: 'withdrawal' | 'deposit'
  customerName?: string
  customerNumber?: string
  commissionRate: number
  extraCharge: number
  profit: number
  notes?: string
  date: string
}

export interface CreateCashWithdrawalInput {
  walletId: string
  walletType: string
  amount: number
  transactionType: 'withdrawal' | 'deposit'
  customerName?: string
  customerNumber?: string
  commissionRate: number
  extraCharge: number
  notes?: string
  date: string
}

export interface RepairJobRecord {
  id: string
  customerName: string
  phone?: string
  deviceModel: string
  serialNumber?: string
  color?: string
  accessories?: string
  issue: string
  status: 'pending' | 'in_progress' | 'completed' | 'delivered'
  charges: number
  advanceAmount: number
  cost?: number
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
  technician?: string
  date: string
  completedAt?: string
  deliveredAt?: string
}

export const BILL_TYPES = ['electricity', 'gas', 'water', 'internet', 'other'] as const
export type BillType = (typeof BILL_TYPES)[number]

export interface UtilityCompanyRecord {
  id: string
  name: string
  billType: BillType
  defaultServiceCharge: number
  isActive: boolean
  createdAt?: string
}

export interface BillPaymentRecord {
  id: string
  customerName: string
  billType: BillType
  companyId: string
  companyName: string
  referenceNumber: string
  billAmount: number
  serviceCharge: number
  totalReceived: number
  dueDate: string
  paymentDate?: string
  status: 'pending' | 'paid' | 'overdue'
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa'
  notes?: string
  createdAt?: string
}

export interface CreateBillPaymentInput {
  customerName: string
  billType: BillType
  companyId: string
  companyName: string
  referenceNumber: string
  billAmount: number
  serviceCharge: number
  dueDate: string
  paymentDate?: string
  status?: 'pending' | 'paid' | 'overdue'
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa'
  notes?: string
}

export interface BillPaymentTrendItem {
  _id: string
  billCount: number
  totalBillAmount: number
  totalServiceCharges: number
  totalCollection: number
}

export interface BillPaymentBreakdownItem {
  _id: string
  billCount: number
  totalBillAmount: number
  totalServiceCharges: number
  totalCollection: number
}

export interface BillPaymentReport {
  totalBills: number
  totalBillAmount: number
  totalServiceCharges: number
  totalCollection: number
  totalDueToday: number
  totalOverdue: number
  totalPending: number
  totalPendingAmount: number
  totalPendingServiceCharges: number
  trend: BillPaymentTrendItem[]
  byBillType: BillPaymentBreakdownItem[]
  byCompany: BillPaymentBreakdownItem[]
}

export interface BillDueSummary {
  totalBills: number
  totalBillAmount: number
  totalServiceCharges: number
  totalReceived: number
}

export interface BillPaymentReceipt {
  customerName: string
  companyName: string
  billType: BillType
  referenceNumber: string
  billAmount: number
  serviceCharge: number
  totalPaid: number
  paymentMethod: string
  dueDate: string
  paymentDate?: string
  status: string
}

export interface CashBookEntryRecord {
  id: string
  type: 'income' | 'expense'
  source: 'sale' | 'load' | 'repair' | 'purchase' | 'expense' | 'other'
  amount: number
  paymentMethod: string
  description?: string
  date: string
}

export interface CashBookSummary {
  totalIncome: number
  totalExpense: number
}

export interface CashBookQueryParams {
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export interface MobileDashboardSummary {
  totalSales: number
  totalLoadSold: number
  totalRepairIncome: number
  totalBillCollection: number
  billPaymentProfit: number
  totalProfit: number
  cashInHand: number
  jazzcashBalance: number
  easypaisaBalance: number
  walletBalance: number
  billsDueToday: number
  billsOverdue: number
}

export const mobileShopApi = createApi({
  reducerPath: 'mobileShopApi',
  baseQuery,
  tagTypes: ['MobileDashboard', 'Wallets', 'LoadPurchases', 'LoadTransactions', 'CashWithdrawals', 'Repairs', 'CashBook', 'UtilityCompanies', 'BillPayments'],
  endpoints: (builder) => ({
    getMobileDashboardSummary: builder.query<MobileDashboardSummary, void>({
      query: () => '/mobile-dashboard/summary',
      providesTags: ['MobileDashboard'],
    }),
    getWallets: builder.query<PaginatedResult<WalletRecord>, void>({
      query: () => '/wallets',
      providesTags: ['Wallets'],
    }),
    upsertWallet: builder.mutation<WalletRecord, { type: string; balance: number; commissionRate?: number; withdrawalCommissionRate?: number; depositCommissionRate?: number; id?: string }>({
      query: (body) => ({
        url: '/wallets',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallets', 'MobileDashboard'],
    }),
    getLoadPurchases: builder.query<PaginatedResult<LoadPurchaseRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/load-purchases?${p.toString()}`
      },
      providesTags: ['LoadPurchases'],
    }),
    createLoadPurchase: builder.mutation<LoadPurchaseRecord, Omit<LoadPurchaseRecord, 'id'>>({
      query: (body) => ({
        url: '/load-purchases',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoadPurchases', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getLoadTransactions: builder.query<PaginatedResult<LoadTransactionRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/load-transactions?${p.toString()}`
      },
      providesTags: ['LoadTransactions'],
    }),
    createLoadTransaction: builder.mutation<LoadTransactionRecord, CreateLoadTransactionInput>({
      query: (body) => ({
        url: '/load-transactions',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoadTransactions', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getCashWithdrawals: builder.query<PaginatedResult<CashWithdrawalRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/cash-withdrawals?${p.toString()}`
      },
      providesTags: ['CashWithdrawals'],
    }),
    createCashWithdrawal: builder.mutation<CashWithdrawalRecord, CreateCashWithdrawalInput>({
      query: (body) => ({
        url: '/cash-withdrawals',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CashWithdrawals', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getRepairJobs: builder.query<PaginatedResult<RepairJobRecord>, { page?: number; limit?: number; status?: string } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.status) p.set('status', (params as any).status)
        return `/repairs?${p.toString()}`
      },
      providesTags: ['Repairs'],
    }),
    createRepairJob: builder.mutation<RepairJobRecord, Omit<RepairJobRecord, 'id'>>({
      query: (body) => ({
        url: '/repairs',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    updateRepairJob: builder.mutation<RepairJobRecord, { id: string; body: Partial<RepairJobRecord> }>({
      query: ({ id, body }) => ({
        url: `/repairs/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    deleteRepairJob: builder.mutation<void, string>({
      query: (id) => ({
        url: `/repairs/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    getCashBookEntries: builder.query<PaginatedResult<CashBookEntryRecord>, CashBookQueryParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams({ limit: String(params?.limit ?? 10) })
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.startDate) searchParams.set('startDate', params.startDate)
        if (params?.endDate) searchParams.set('endDate', params.endDate)
        return `/cash-book?${searchParams.toString()}`
      },
      providesTags: ['CashBook'],
    }),
    getCashBookSummary: builder.query<CashBookSummary, CashBookQueryParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()

        if (params?.startDate) {
          searchParams.set('startDate', params.startDate)
        }
        if (params?.endDate) {
          searchParams.set('endDate', params.endDate)
        }

        const queryString = searchParams.toString()
        return queryString ? `/cash-book/summary?${queryString}` : '/cash-book/summary'
      },
      providesTags: ['CashBook'],
    }),

    // ─── Utility Companies ───────────────────────────────────────────────────
    getUtilityCompanies: builder.query<PaginatedResult<UtilityCompanyRecord>, { billType?: string; isActive?: boolean } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: '100' })
        if ((params as any)?.billType) p.set('billType', (params as any).billType)
        if ((params as any)?.isActive !== undefined) p.set('isActive', String((params as any).isActive))
        return `/utility-companies?${p.toString()}`
      },
      providesTags: ['UtilityCompanies'],
    }),
    createUtilityCompany: builder.mutation<UtilityCompanyRecord, Omit<UtilityCompanyRecord, 'id' | 'createdAt'>>({
      query: (body) => ({ url: '/utility-companies', method: 'POST', body }),
      invalidatesTags: ['UtilityCompanies'],
    }),
    updateUtilityCompany: builder.mutation<UtilityCompanyRecord, { id: string; body: Partial<Omit<UtilityCompanyRecord, 'id'>> }>({
      query: ({ id, body }) => ({ url: `/utility-companies/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['UtilityCompanies'],
    }),
    deleteUtilityCompany: builder.mutation<void, string>({
      query: (id) => ({ url: `/utility-companies/${id}`, method: 'DELETE' }),
      invalidatesTags: ['UtilityCompanies'],
    }),

    // ─── Bill Payments ───────────────────────────────────────────────────────
    getBillPayments: builder.query<
      PaginatedResult<BillPaymentRecord>,
      { page?: number; limit?: number; status?: string; billType?: string; companyId?: string; search?: string; startDate?: string; endDate?: string; dueStartDate?: string; dueEndDate?: string } | void
    >({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.status) p.set('status', (params as any).status)
        if ((params as any)?.billType) p.set('billType', (params as any).billType)
        if ((params as any)?.companyId) p.set('companyId', (params as any).companyId)
        if ((params as any)?.search) p.set('search', (params as any).search)
        if ((params as any)?.startDate) p.set('startDate', (params as any).startDate)
        if ((params as any)?.endDate) p.set('endDate', (params as any).endDate)
        if ((params as any)?.dueStartDate) p.set('dueStartDate', (params as any).dueStartDate)
        if ((params as any)?.dueEndDate) p.set('dueEndDate', (params as any).dueEndDate)
        return `/bill-payments?${p.toString()}`
      },
      providesTags: ['BillPayments'],
    }),
    createBillPayment: builder.mutation<BillPaymentRecord, CreateBillPaymentInput>({
      query: (body) => ({ url: '/bill-payments', method: 'POST', body }),
      invalidatesTags: ['BillPayments', 'CashBook', 'MobileDashboard'],
    }),
    updateBillPayment: builder.mutation<BillPaymentRecord, { id: string; body: Partial<CreateBillPaymentInput> }>({
      query: ({ id, body }) => ({ url: `/bill-payments/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['BillPayments', 'CashBook', 'MobileDashboard'],
    }),
    deleteBillPayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/bill-payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BillPayments', 'CashBook', 'MobileDashboard'],
    }),
    getBillPaymentReceipt: builder.query<BillPaymentReceipt, string>({
      query: (id) => `/bill-payments/${id}/receipt`,
    }),
    getBillsDueToday: builder.query<BillPaymentRecord[], void>({
      query: () => '/bill-payments/due-today',
      providesTags: ['BillPayments'],
    }),
    getOverdueBills: builder.query<BillPaymentRecord[], void>({
      query: () => '/bill-payments/overdue',
      providesTags: ['BillPayments'],
    }),
    getBillDueSummary: builder.query<BillDueSummary, { dueStartDate?: string; dueEndDate?: string } | void>({
      query: (params) => {
        const p = new URLSearchParams()
        if ((params as any)?.dueStartDate) p.set('dueStartDate', (params as any).dueStartDate)
        if ((params as any)?.dueEndDate) p.set('dueEndDate', (params as any).dueEndDate)
        const qs = p.toString()
        return qs ? `/bill-payments/due-summary?${qs}` : '/bill-payments/due-summary'
      },
      providesTags: ['BillPayments'],
    }),
    getBillPaymentReport: builder.query<
      BillPaymentReport,
      { startDate?: string; endDate?: string; billType?: string; companyId?: string } | void
    >({
      query: (params) => {
        const p = new URLSearchParams()
        if ((params as any)?.startDate) p.set('startDate', (params as any).startDate)
        if ((params as any)?.endDate) p.set('endDate', (params as any).endDate)
        if ((params as any)?.billType) p.set('billType', (params as any).billType)
        if ((params as any)?.companyId) p.set('companyId', (params as any).companyId)
        const qs = p.toString()
        return qs ? `/bill-payments/report?${qs}` : '/bill-payments/report'
      },
      providesTags: ['BillPayments'],
    }),
  }),
})

export const {
  useGetMobileDashboardSummaryQuery,
  useGetWalletsQuery,
  useUpsertWalletMutation,
  useGetLoadPurchasesQuery,
  useCreateLoadPurchaseMutation,
  useGetLoadTransactionsQuery,
  useCreateLoadTransactionMutation,
  useGetCashWithdrawalsQuery,
  useCreateCashWithdrawalMutation,
  useGetRepairJobsQuery,
  useCreateRepairJobMutation,
  useUpdateRepairJobMutation,
  useGetCashBookEntriesQuery,
  useGetCashBookSummaryQuery,
  useDeleteRepairJobMutation,
  useGetUtilityCompaniesQuery,
  useCreateUtilityCompanyMutation,
  useUpdateUtilityCompanyMutation,
  useDeleteUtilityCompanyMutation,
  useGetBillPaymentsQuery,
  useCreateBillPaymentMutation,
  useUpdateBillPaymentMutation,
  useDeleteBillPaymentMutation,
  useGetBillPaymentReceiptQuery,
  useGetBillsDueTodayQuery,
  useGetOverdueBillsQuery,
  useGetBillPaymentReportQuery,
  useGetBillDueSummaryQuery,
} = mobileShopApi