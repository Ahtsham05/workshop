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
  supplierId?: string
  amount: number
  paidAmount?: number
  supplierName?: string
  paymentMethod: 'cash' | 'bank' | 'wallet'
  paymentWalletType?: string
  commissionRate: number
  extraCharge: number
  profit: number
  date: string
}

export type CreateLoadPurchaseInput = Omit<LoadPurchaseRecord, 'id' | 'profit'>

export interface LoadTransactionRecord {
  id: string
  type: 'normal' | 'package'
  walletType: string
  walletId?: string
  customerId?: string
  customerName?: string
  network: string
  mobileNumber: string
  amount: number
  receivedAmount?: number
  commissionRate: number
  extraCharge: number
  profit: number
  paymentMethod: 'cash' | 'bank' | 'wallet'
  paymentWalletType?: string
  date: string
}

export interface CreateLoadTransactionInput {
  type: 'normal' | 'package'
  walletType: string
  walletId: string
  customerId?: string
  customerName?: string
  network: string
  mobileNumber: string
  amount: number
  receivedAmount?: number
  commissionRate: number
  extraCharge: number
  paymentMethod: 'cash' | 'bank' | 'wallet'
  paymentWalletType?: string
  date: string
}

export interface CashWithdrawalRecord {
  id: string
  walletId: string
  walletType: string
  amount: number
  cashAmount?: number
  transactionType: 'withdrawal' | 'deposit'
  customerId?: string
  customerName?: string
  customerNumber?: string
  customerCNIC?: string
  customerAccountType?: string
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
  cashAmount?: number
  transactionType: 'withdrawal' | 'deposit'
  customerId?: string
  customerName?: string
  customerNumber?: string
  customerCNIC?: string
  customerAccountType?: string
  commissionRate: number
  extraCharge: number
  notes?: string
  date: string
}

export interface CashWithdrawalBatchEntry {
  amount: number
  customerName?: string
  customerNumber?: string
  customerCNIC?: string
  customerAccountType?: string
  extraCharge?: number
  notes?: string
}

export interface CreateCashWithdrawalsBatchInput {
  walletId: string
  walletType: string
  transactionType: 'withdrawal' | 'deposit'
  commissionRate: number
  date: string
  entries: CashWithdrawalBatchEntry[]
}

export interface RepairStockEntry {
  id: string
  type: 'purchase' | 'repair_usage'
  description: string
  amount: number
  repairJobRef?: string
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  notes?: string
  date: string
  createdAt?: string
}

export interface CreateRepairStockPurchaseInput {
  description: string
  amount: number
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  notes?: string
  date?: string
}

export interface CreateRepairStockUsageInput {
  description: string
  amount: number
  repairJobRef?: string
  notes?: string
  date?: string
}

export interface RepairStockSummary {
  totalPurchased: number
  totalUsed: number
  balance: number
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
  paymentMethod: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  technician?: string
  date: string
  completedAt?: string
  deliveredAt?: string
}

export interface ServiceCatalogRecord {
  id: string
  serviceName: string
  details?: string
  price: number
  isActive: boolean
}

export interface CreateServiceCatalogInput {
  serviceName: string
  details?: string
  price: number
  isActive?: boolean
}

export interface ServiceInvoiceItemInput {
  serviceId: string
  unitPrice?: number
  quantity: number
}

export interface ServiceInvoiceItemRecord {
  serviceId: string
  serviceName: string
  unitPrice: number
  quantity: number
  total: number
}

export interface ServiceInvoiceRecord {
  id: string
  invoiceNumber: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  items: ServiceInvoiceItemRecord[]
  subtotal: number
  totalAmount: number
  paymentMethod?: 'cash' | 'jazzcash' | 'easypaisa' | 'bank' | 'card'
  date: string
  notes?: string
}

export interface CreateServiceInvoiceInput {
  customerId?: string
  customerName?: string
  customerPhone?: string
  date?: string
  notes?: string
  items: ServiceInvoiceItemInput[]
}

export type UpdateServiceInvoiceInput = Partial<CreateServiceInvoiceInput>

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
  actualBillAmount?: number
  expectedLateAmount?: number
  latePaymentLoss?: number
  netBillProfit?: number
  paidAfterDueDate?: boolean
  dueDate: string
  paymentDate?: string
  status: 'pending' | 'paid' | 'overdue'
  paymentMethod: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
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
  actualBillAmount?: number
  expectedLateAmount?: number
  paymentMethod: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  notes?: string
}

export interface CreateBillPaymentsBatchInput {
  companyId: string
  companyName: string
  billType: BillType
  serviceCharge: number
  dueDate: string
  paymentDate?: string
  paymentMethod: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  bills: { billAmount: number; expectedLateAmount?: number; customerName?: string; referenceNumber?: string }[]
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
  totalLatePaymentLoss: number
  totalNetBillProfit: number
  totalActualBillAmount: number
  latePaidCount: number
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
  dueTodayCount: number
  overdueCount: number
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
  previousOutstanding?: {
    referenceNumber: string
    dueDate: string
    billAmount: number
    totalReceived: number
    expectedLateAmount?: number
    status: string
  } | null
}

export interface CashBookEntryRecord {
  id: string
  type: 'income' | 'expense'
  source:
    | 'sale'
    | 'load'
    | 'repair'
    | 'service'
    | 'purchase'
    | 'expense'
    | 'other'
    | 'opening_balance'
    | 'wallet'
  amount: number
  paymentMethod: string
  description?: string
  date: string
  /** Running cash balance immediately after this entry, walked in true chronological order. */
  balance: number
}

export interface CashBookSummary {
  openingBalance: number
  totalIncome: number
  totalExpense: number
  closingBalance: number
}

export interface CashBookQueryParams {
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
  paymentMethod?: 'cash'
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

export interface InstallmentPlanRecord {
  id: string
  planNumber: string
  productId: string
  quantity: number
  customerName: string
  customerPhone?: string
  customerCNIC?: string
  customerAddress?: string
  guarantorName?: string
  guarantorPhone?: string
  itemDescription: string
  totalAmount: number
  downPayment: number
  remainingAmount: number
  totalInstallments: number
  installmentFrequency: 'weekly' | 'biweekly' | 'monthly'
  installmentAmount: number
  paidInstallments: number
  totalPaid: number
  totalOutstanding: number
  nextDueDate?: string
  startDate: string
  status: 'active' | 'completed' | 'defaulted' | 'cancelled'
  notes?: string
  createdAt: string
}

export interface InstallmentPaymentRecord {
  id: string
  installmentPlanId: string
  amount: number
  paymentNumber: number
  paymentMethod: 'cash' | 'bank' | 'wallet' | 'jazzcash' | 'easypaisa'
  walletType?: string
  isDownPayment: boolean
  date: string
  notes?: string
  createdAt: string
}

export interface InstallmentSummary {
  active:      { count: number; totalOutstanding: number; totalAmount: number }
  completed:   { count: number; totalOutstanding: number; totalAmount: number }
  defaulted:   { count: number; totalOutstanding: number; totalAmount: number }
  cancelled:   { count: number; totalOutstanding: number; totalAmount: number }
  overdueCount: number
  totalCollected: number
}

export interface SimSaleRecord {
  id: string
  jobNumber: number
  date: string
  productId?: string
  productName?: string
  simAmount: number
  walletType?: string
  loadAmount: number
  purchaseAmount: number
  saleAmount: number
  commission: number
  customerId?: string
  customerName?: string
  customerMobile?: string
  customerCNIC?: string
  customerLocation?: string
  paymentMethod: 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'wallet'
  paymentWalletType?: string
  notes?: string
  createdAt?: string
}

export interface CreateSimSaleInput {
  date?: string
  productId?: string
  productName?: string
  simAmount: number
  walletType?: string
  loadAmount?: number
  saleAmount: number
  customerId?: string
  customerName?: string
  customerMobile?: string
  customerCNIC?: string
  customerLocation?: string
  paymentMethod?: 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'wallet'
  paymentWalletType?: string
  notes?: string
}

export interface AgentBillRecord {
  id: string
  companyId?: string
  companyName?: string
  dueDate?: string
  paymentMethod?: 'cash' | 'bank' | 'wallet'
  walletType?: string
  customerName: string
  referenceNumber: string
  mobileNo?: string
  currentBillAmount: number
  previousBillAmount: number
  overdueAmount: number
  profit: number
  totalAmount: number
  createdAt: string
}

export interface CreateAgentBillsBatchInput {
  bills: {
    customerName: string
    referenceNumber: string
    mobileNo?: string
    currentBillAmount: number
    previousBillAmount: number
    overdueAmount: number
    profit: number
  }[]
  companyId?: string
  companyName?: string
  dueDate: string
  paymentMethod: 'cash' | 'bank' | 'wallet'
  walletType?: string
}

export const mobileShopApi = createApi({
  reducerPath: 'mobileShopApi',
  baseQuery,
  tagTypes: ['MobileDashboard', 'Wallets', 'LoadPurchases', 'LoadTransactions', 'CashWithdrawals', 'Repairs', 'Services', 'ServiceInvoices', 'RepairStock', 'CashBook', 'UtilityCompanies', 'BillPayments', 'Installments', 'SimSales', 'Customer', 'AgentBills'],
  endpoints: (builder) => ({
    getMobileDashboardSummary: builder.query<MobileDashboardSummary, void>({
      query: () => '/mobile-dashboard/summary',
      providesTags: ['MobileDashboard'],
    }),
    getWallets: builder.query<PaginatedResult<WalletRecord>, void>({
      query: () => '/wallets?limit=100',
      transformResponse: (response: PaginatedResult<WalletRecord & { _id?: string }>) => ({
        ...response,
        results: (response.results || []).map((w) => ({
          ...w,
          id: w.id || (w._id != null ? String(w._id) : ''),
        })),
      }),
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
    deleteWallet: builder.mutation<void, string>({
      query: (id) => ({
        url: `/wallets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Wallets', 'LoadPurchases', 'LoadTransactions', 'CashWithdrawals', 'SimSales', 'CashBook', 'MobileDashboard'],
    }),
    getLoadPurchases: builder.query<PaginatedResult<LoadPurchaseRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/load-purchases?${p.toString()}`
      },
      providesTags: ['LoadPurchases'],
    }),
    createLoadPurchase: builder.mutation<LoadPurchaseRecord, CreateLoadPurchaseInput>({
      query: (body) => ({
        url: '/load-purchases',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoadPurchases', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    updateLoadPurchase: builder.mutation<LoadPurchaseRecord, { id: string; body: Partial<CreateLoadPurchaseInput> }>({
      query: ({ id, body }) => ({
        url: `/load-purchases/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['LoadPurchases', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    deleteLoadPurchase: builder.mutation<void, string>({
      query: (id) => ({
        url: `/load-purchases/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LoadPurchases', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getLoadPurchaseById: builder.query<LoadPurchaseRecord, string>({
      query: (id) => `/load-purchases/${id}`,
      providesTags: ['LoadPurchases'],
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
    updateLoadTransaction: builder.mutation<LoadTransactionRecord, { id: string; body: Partial<CreateLoadTransactionInput> }>({
      query: ({ id, body }) => ({
        url: `/load-transactions/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['LoadTransactions', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    deleteLoadTransaction: builder.mutation<void, string>({
      query: (id) => ({
        url: `/load-transactions/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LoadTransactions', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getLoadTransactionById: builder.query<LoadTransactionRecord, string>({
      query: (id) => `/load-transactions/${id}`,
      providesTags: ['LoadTransactions'],
    }),
    getCashWithdrawals: builder.query<PaginatedResult<CashWithdrawalRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/cash-withdrawals?${p.toString()}`
      },
      providesTags: ['CashWithdrawals'],
    }),
    getCashWithdrawalById: builder.query<CashWithdrawalRecord, string>({
      query: (id) => `/cash-withdrawals/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'CashWithdrawals', id }],
    }),
    createCashWithdrawal: builder.mutation<CashWithdrawalRecord, CreateCashWithdrawalInput>({
      query: (body) => ({
        url: '/cash-withdrawals',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CashWithdrawals', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    createCashWithdrawalsBatch: builder.mutation<CashWithdrawalRecord[], CreateCashWithdrawalsBatchInput>({
      query: (body) => ({
        url: '/cash-withdrawals/batch',
        method: 'POST',
        body,
        timeout: 120000,
      }),
      invalidatesTags: ['CashWithdrawals', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    updateCashWithdrawal: builder.mutation<CashWithdrawalRecord, { id: string; body: Partial<CreateCashWithdrawalInput> }>({
      query: ({ id, body }) => ({
        url: `/cash-withdrawals/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['CashWithdrawals', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    deleteCashWithdrawal: builder.mutation<void, string>({
      query: (id) => ({
        url: `/cash-withdrawals/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['CashWithdrawals', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    deleteCashWithdrawalsBatch: builder.mutation<{ deleted: number; failed: number }, { ids: string[] }>({
      query: (body) => ({
        url: '/cash-withdrawals/batch',
        method: 'DELETE',
        body,
        timeout: 120000,
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

    // ─── Services Catalog ───────────────────────────────────────────────────
    getServices: builder.query<
      PaginatedResult<ServiceCatalogRecord>,
      { page?: number; limit?: number; serviceName?: string; isActive?: boolean } | void
    >({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 50) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.serviceName) p.set('serviceName', (params as any).serviceName)
        if ((params as any)?.isActive !== undefined) p.set('isActive', String((params as any).isActive))
        return `/services?${p.toString()}`
      },
      providesTags: ['Services'],
    }),
    createService: builder.mutation<ServiceCatalogRecord, CreateServiceCatalogInput>({
      query: (body) => ({
        url: '/services',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Services'],
    }),
    updateService: builder.mutation<ServiceCatalogRecord, { id: string; body: Partial<CreateServiceCatalogInput> }>({
      query: ({ id, body }) => ({
        url: `/services/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Services'],
    }),
    deleteService: builder.mutation<void, string>({
      query: (id) => ({
        url: `/services/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Services'],
    }),

    // ─── Service Invoices ───────────────────────────────────────────────────
    getServiceInvoices: builder.query<
      PaginatedResult<ServiceInvoiceRecord>,
      { page?: number; limit?: number; customerName?: string; invoiceNumber?: string; startDate?: string; endDate?: string } | void
    >({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 20) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.customerName) p.set('customerName', (params as any).customerName)
        if ((params as any)?.invoiceNumber) p.set('invoiceNumber', (params as any).invoiceNumber)
        if ((params as any)?.startDate) p.set('startDate', (params as any).startDate)
        if ((params as any)?.endDate) p.set('endDate', (params as any).endDate)
        return `/services/invoices?${p.toString()}`
      },
      providesTags: ['ServiceInvoices'],
    }),
    createServiceInvoice: builder.mutation<ServiceInvoiceRecord, CreateServiceInvoiceInput>({
      query: (body) => ({
        url: '/services/invoices',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ServiceInvoices', 'CashBook', 'MobileDashboard', 'Customer'],
    }),
    updateServiceInvoice: builder.mutation<ServiceInvoiceRecord, { id: string; body: UpdateServiceInvoiceInput }>({
      query: ({ id, body }) => ({
        url: `/services/invoices/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ServiceInvoices', 'CashBook', 'MobileDashboard', 'Customer'],
    }),
    deleteServiceInvoice: builder.mutation<void, string>({
      query: (id) => ({
        url: `/services/invoices/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ServiceInvoices', 'CashBook', 'MobileDashboard', 'Customer'],
    }),

    // ─── Repair Stock Ledger ─────────────────────────────────────────────────
    getRepairStockLedger: builder.query<PaginatedResult<RepairStockEntry>, { page?: number; limit?: number; startDate?: string; endDate?: string } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 200), sortBy: 'date:asc' })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.startDate) p.set('startDate', (params as any).startDate)
        if ((params as any)?.endDate) p.set('endDate', (params as any).endDate)
        return `/repair-stock?${p.toString()}`
      },
      providesTags: ['RepairStock'],
    }),
    createRepairStockPurchase: builder.mutation<RepairStockEntry, CreateRepairStockPurchaseInput>({
      query: (body) => ({ url: '/repair-stock', method: 'POST', body }),
      invalidatesTags: ['RepairStock', 'CashBook', 'MobileDashboard'],
    }),
    createRepairStockUsage: builder.mutation<RepairStockEntry, CreateRepairStockUsageInput>({
      query: (body) => ({ url: '/repair-stock/use', method: 'POST', body }),
      invalidatesTags: ['RepairStock'],
    }),
    deleteRepairStockEntry: builder.mutation<void, string>({
      query: (id) => ({ url: `/repair-stock/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RepairStock', 'CashBook', 'MobileDashboard'],
    }),
    getRepairStockSummary: builder.query<RepairStockSummary, void>({
      query: () => '/repair-stock/summary',
      providesTags: ['RepairStock'],
    }),

    getCashBookEntries: builder.query<PaginatedResult<CashBookEntryRecord>, CashBookQueryParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams({ limit: String(params?.limit ?? 10) })
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.startDate) searchParams.set('startDate', params.startDate)
        if (params?.endDate) searchParams.set('endDate', params.endDate)
        if (params?.paymentMethod) searchParams.set('paymentMethod', params.paymentMethod)
        return `/cash-book?${searchParams.toString()}`
      },
      providesTags: ['CashBook'],
    }),
    getOpeningBalance: builder.query<{ amount: number; id: string | null }, void>({
      query: () => '/cash-book/opening-balance',
      providesTags: ['CashBook'],
    }),
    setOpeningBalance: builder.mutation<{ amount: number; id: string | null }, { amount: number }>({
      query: (body) => ({ url: '/cash-book/opening-balance', method: 'POST', body }),
      invalidatesTags: ['CashBook'],
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
      {
        page?: number
        limit?: number
        status?: string
        billType?: string
        companyId?: string
        search?: string
        startDate?: string
        endDate?: string
        dueStartDate?: string
        dueEndDate?: string
        dateFilterBy?: 'recorded' | 'due'
      } | void
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
        if ((params as any)?.dateFilterBy) p.set('dateFilterBy', (params as any).dateFilterBy)
        return `/bill-payments?${p.toString()}`
      },
      providesTags: ['BillPayments'],
    }),
    createBillPayment: builder.mutation<BillPaymentRecord, CreateBillPaymentInput>({
      query: (body) => ({ url: '/bill-payments', method: 'POST', body }),
      invalidatesTags: ['BillPayments', 'CashBook', 'MobileDashboard'],
    }),
    createBillPaymentsBatch: builder.mutation<BillPaymentRecord[], CreateBillPaymentsBatchInput>({
      query: (body) => ({ url: '/bill-payments/batch', method: 'POST', body }),
      invalidatesTags: ['BillPayments', 'CashBook', 'MobileDashboard'],
    }),
    settleCombinedBill: builder.mutation<
      { newBill: BillPaymentRecord; oldBill: BillPaymentRecord },
      { newBill: CreateBillPaymentInput; oldBillId: string; actualOldBillAmount: number }
    >({
      query: (body) => ({ url: '/bill-payments/settle-combined', method: 'POST', body }),
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
    getBillDueSummary: builder.query<
      BillDueSummary,
      { dueStartDate?: string; dueEndDate?: string; dateFilterBy?: 'recorded' | 'due' } | void
    >({
      query: (params) => {
        const p = new URLSearchParams()
        if ((params as any)?.dueStartDate) p.set('dueStartDate', (params as any).dueStartDate)
        if ((params as any)?.dueEndDate) p.set('dueEndDate', (params as any).dueEndDate)
        if ((params as any)?.dateFilterBy) p.set('dateFilterBy', (params as any).dateFilterBy)
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

    // ── Installments ──────────────────────────────────────────────────────────
    getInstallmentPlans: builder.query<
      PaginatedResult<InstallmentPlanRecord>,
      { page?: number; limit?: number; status?: string; search?: string; startDate?: string; endDate?: string } | void
    >({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 20) })
        if ((params as any)?.page)      p.set('page', String((params as any).page))
        if ((params as any)?.status)    p.set('status', (params as any).status)
        if ((params as any)?.search)    p.set('search', (params as any).search)
        if ((params as any)?.startDate) p.set('startDate', (params as any).startDate)
        if ((params as any)?.endDate)   p.set('endDate', (params as any).endDate)
        return `/installments?${p.toString()}`
      },
      providesTags: ['Installments'],
    }),
    getInstallmentPlan: builder.query<InstallmentPlanRecord, string>({
      query: (id) => `/installments/${id}`,
      providesTags: ['Installments'],
    }),
    createInstallmentPlan: builder.mutation<InstallmentPlanRecord, Partial<InstallmentPlanRecord> & { paymentMethod?: string; walletType?: string }>({
      query: (body) => ({ url: '/installments', method: 'POST', body }),
      invalidatesTags: ['Installments', 'CashBook', 'MobileDashboard'],
    }),
    updateInstallmentPlan: builder.mutation<InstallmentPlanRecord, { id: string; body: Partial<InstallmentPlanRecord> }>({
      query: ({ id, body }) => ({ url: `/installments/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Installments'],
    }),
    deleteInstallmentPlan: builder.mutation<void, string>({
      query: (id) => ({ url: `/installments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Installments', 'CashBook', 'MobileDashboard'],
    }),
    recordInstallmentPayment: builder.mutation<
      { payment: InstallmentPaymentRecord; plan: InstallmentPlanRecord },
      { planId: string; amount: number; paymentMethod?: string; walletType?: string; date?: string; notes?: string }
    >({
      query: ({ planId, ...body }) => ({ url: `/installments/${planId}/payments`, method: 'POST', body }),
      invalidatesTags: ['Installments', 'CashBook', 'MobileDashboard'],
    }),
    getInstallmentPayments: builder.query<
      PaginatedResult<InstallmentPaymentRecord>,
      { planId: string; page?: number; limit?: number }
    >({
      query: ({ planId, ...params }) => {
        const p = new URLSearchParams({ limit: String(params.limit ?? 50) })
        if (params.page) p.set('page', String(params.page))
        return `/installments/${planId}/payments?${p.toString()}`
      },
      providesTags: ['Installments'],
    }),
    deleteInstallmentPayment: builder.mutation<void, { planId: string; paymentId: string }>({
      query: ({ planId, paymentId }) => ({ url: `/installments/${planId}/payments/${paymentId}`, method: 'DELETE' }),
      invalidatesTags: ['Installments', 'CashBook', 'MobileDashboard'],
    }),
    getInstallmentSummary: builder.query<InstallmentSummary, void>({
      query: () => '/installments/summary',
      providesTags: ['Installments'],
    }),

    // ─── Sim Sales ───────────────────────────────────────────────────────────
    getSimSales: builder.query<PaginatedResult<SimSaleRecord>, { page?: number; limit?: number; search?: string } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 10) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        if ((params as any)?.search) p.set('search', String((params as any).search))
        return `/sim-sales?${p.toString()}`
      },
      providesTags: ['SimSales'],
    }),
    getSimSaleById: builder.query<SimSaleRecord, string>({
      query: (id) => `/sim-sales/${id}`,
      providesTags: ['SimSales'],
    }),
    createSimSale: builder.mutation<SimSaleRecord, CreateSimSaleInput>({
      query: (body) => ({ url: '/sim-sales', method: 'POST', body }),
      invalidatesTags: ['SimSales', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    updateSimSale: builder.mutation<SimSaleRecord, { id: string; body: Partial<CreateSimSaleInput> }>({
      query: ({ id, body }) => ({ url: `/sim-sales/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['SimSales', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    deleteSimSale: builder.mutation<void, string>({
      query: (id) => ({ url: `/sim-sales/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SimSales', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),

    // ─── Agent Bills (bilalmulazim7086@gmail.com) ─────────────────────────────
    getAgentBills: builder.query<PaginatedResult<AgentBillRecord>, { page?: number; limit?: number } | void>({
      query: (params) => {
        const p = new URLSearchParams({ limit: String((params as any)?.limit ?? 50) })
        if ((params as any)?.page) p.set('page', String((params as any).page))
        return `/agent-bills?${p.toString()}`
      },
      providesTags: ['AgentBills'],
    }),
    createAgentBillsBatch: builder.mutation<AgentBillRecord[], CreateAgentBillsBatchInput>({
      query: (body) => ({ url: '/agent-bills/batch', method: 'POST', body }),
      invalidatesTags: ['AgentBills', 'CashBook', 'MobileDashboard', 'Wallets'],
    }),
    deleteAgentBill: builder.mutation<void, string>({
      query: (id) => ({ url: `/agent-bills/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AgentBills', 'CashBook', 'MobileDashboard', 'Wallets'],
    }),
  }),
})

export const {
  useGetMobileDashboardSummaryQuery,
  useGetWalletsQuery,
  useUpsertWalletMutation,
  useDeleteWalletMutation,
  useGetLoadPurchasesQuery,
  useGetLoadPurchaseByIdQuery,
  useLazyGetLoadPurchaseByIdQuery,
  useCreateLoadPurchaseMutation,
  useUpdateLoadPurchaseMutation,
  useDeleteLoadPurchaseMutation,
  useGetLoadTransactionsQuery,
  useGetLoadTransactionByIdQuery,
  useLazyGetLoadTransactionByIdQuery,
  useCreateLoadTransactionMutation,
  useUpdateLoadTransactionMutation,
  useDeleteLoadTransactionMutation,
  useGetCashWithdrawalsQuery,
  useGetCashWithdrawalByIdQuery,
  useCreateCashWithdrawalMutation,
  useCreateCashWithdrawalsBatchMutation,
  useUpdateCashWithdrawalMutation,
  useDeleteCashWithdrawalMutation,
  useDeleteCashWithdrawalsBatchMutation,
  useGetRepairJobsQuery,
  useCreateRepairJobMutation,
  useUpdateRepairJobMutation,
  useGetServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useDeleteServiceMutation,
  useGetServiceInvoicesQuery,
  useCreateServiceInvoiceMutation,
  useUpdateServiceInvoiceMutation,
  useDeleteServiceInvoiceMutation,
  useGetCashBookEntriesQuery,
  useGetCashBookSummaryQuery,
  useGetOpeningBalanceQuery,
  useSetOpeningBalanceMutation,
  useDeleteRepairJobMutation,
  useGetRepairStockLedgerQuery,
  useCreateRepairStockPurchaseMutation,
  useCreateRepairStockUsageMutation,
  useDeleteRepairStockEntryMutation,
  useGetRepairStockSummaryQuery,
  useGetUtilityCompaniesQuery,
  useCreateUtilityCompanyMutation,
  useUpdateUtilityCompanyMutation,
  useDeleteUtilityCompanyMutation,
  useGetBillPaymentsQuery,
  useLazyGetBillPaymentsQuery,
  useCreateBillPaymentMutation,
  useCreateBillPaymentsBatchMutation,
  useSettleCombinedBillMutation,
  useUpdateBillPaymentMutation,
  useDeleteBillPaymentMutation,
  useGetBillPaymentReceiptQuery,
  useGetBillsDueTodayQuery,
  useGetOverdueBillsQuery,
  useGetBillPaymentReportQuery,
  useGetBillDueSummaryQuery,
  // Installments
  useGetInstallmentPlansQuery,
  useGetInstallmentPlanQuery,
  useCreateInstallmentPlanMutation,
  useUpdateInstallmentPlanMutation,
  useDeleteInstallmentPlanMutation,
  useRecordInstallmentPaymentMutation,
  useGetInstallmentPaymentsQuery,
  useDeleteInstallmentPaymentMutation,
  useGetInstallmentSummaryQuery,
  // Sim Sales
  useGetSimSalesQuery,
  useGetSimSaleByIdQuery,
  useLazyGetSimSaleByIdQuery,
  useCreateSimSaleMutation,
  useUpdateSimSaleMutation,
  useDeleteSimSaleMutation,
  // Agent Bills
  useGetAgentBillsQuery,
  useCreateAgentBillsBatchMutation,
  useDeleteAgentBillMutation,
} = mobileShopApi