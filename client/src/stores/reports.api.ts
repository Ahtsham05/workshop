import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

// Custom base query with auth handling
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: `${baseUrl}/reports`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) {
        headers.set('authorization', `Bearer ${token}`)
      }
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) {
        headers.set('x-branch-id', activeBranchId)
      }
      return headers
    },
  })

  const result = await baseQuery(args, api, extraOptions)
  
  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.')
  }
  
  return result
}

export interface SalesReportData {
  _id: string
  totalSales: number
  totalProfit: number
  totalCost: number
  invoiceCount: number
  avgSale: number
}

export interface SalesReportSummary {
  totalRevenue: number
  totalProfit: number
  totalCost: number
  totalInvoices: number
  avgInvoiceValue: number
  maxInvoiceValue: number
  minInvoiceValue: number
}

export interface PurchaseReportData {
  _id: {
    date: string
    supplier: string
  }
  totalAmount: number
  paidAmount: number
  balance: number
  purchaseCount: number
  cashPaid: number
  creditBalance: number
  paymentTypes: string[]
}

export interface ProductReportData {
  _id: string
  productName: string
  category: string
  totalQuantitySold: number
  totalRevenue: number
  totalProfit: number
  avgSellingPrice: number
  currentStock: number
  minStockLevel: number
  unit?: string
}

export interface CustomerReportData {
  _id: string
  customerName: string
  phone?: string
  email?: string
  totalPurchases: number
  totalSpent: number
  totalProfit: number
  avgPurchaseValue: number
  lastPurchase: string
  firstPurchase: string
}

export interface SupplierReportData {
  _id: string
  supplierName: string
  phone?: string
  email?: string
  totalPurchases: number
  totalAmount: number
  totalPaid: number
  totalCashPaid: number
  totalBalance: number
  avgPurchaseValue: number
  lastPurchase: string
}

export interface ExpenseReportData {
  _id: {
    date: string
    category: string
  }
  totalAmount: number
  expenseCount: number
}

export interface ProfitLossReport {
  revenue: {
    totalRevenue: number
    salesReturns: number
    salesReturnsCount: number
    netRevenue: number
    costOfGoodsSold: number
    grossProfit: number
    grossProfitMargin: number
  }
  purchases: {
    purchaseReturns: number
    purchaseReturnsCount: number
  }
  expenses: {
    totalExpenses: number
  }
  netProfit: {
    amount: number
    margin: number
  }
  period: {
    startDate: string
    endDate: string
  }
}

export interface InventoryReportData {
  _id: string
  name: string
  barcode: string
  category: string
  stockQuantity: number
  minStockLevel: number
  purchasePrice: number
  sellingPrice: number
  stockValue: number
  potentialRevenue: number
  status: string
  unit?: string
}

export interface TaxReportData {
  _id: string
  totalSales: number
  totalTax: number
  invoiceCount: number
}

export interface ReturnReportItem {
  _id: string
  productName: string
  totalQty: number
  totalValue: number
  returnCount: number
}

export interface ReturnReportDatewise {
  _id: string
  totalAmount: number
  count: number
}

export interface ReturnReportSummary {
  totalReturnsAmount: number
  totalReturns: number
  totalItemsReturned: number
}

export interface ReturnsReport {
  summary: ReturnReportSummary
  datewise: ReturnReportDatewise[]
  productwise: ReturnReportItem[]
  period: { startDate: string; endDate: string }
}

// ── Load Report ──────────────────────────────────────────────────────────────
export interface LoadReportSummary {
  totalTransactions: number
  totalSold: number
  totalProfit: number
  totalExtraCharges: number
  totalPurchased: number
  netBalance: number
}
export interface LoadByWallet {
  _id: string
  transactions: number
  totalSold: number
  totalProfit: number
}
export interface LoadDatewise {
  _id: string
  transactions: number
  totalSold: number
  totalProfit: number
}
export interface LoadPurchaseByWallet {
  _id: string
  totalPurchased: number
  count: number
}
export interface WalletBalance {
  _id: string
  type: string
  balance: number
}
export interface WithdrawalSummary {
  totalCount: number
  totalWithdrawals: number
  totalDeposits: number
  totalWithdrawalAmount: number
  totalDepositAmount: number
  totalProfit: number
}
export interface WithdrawalDatewise {
  _id: string
  count: number
  totalWithdrawalAmount: number
  totalDepositAmount: number
  totalProfit: number
}
export interface LoadReport {
  summary: LoadReportSummary
  byWallet: LoadByWallet[]
  datewise: LoadDatewise[]
  purchases: LoadPurchaseByWallet[]
  wallets: WalletBalance[]
  withdrawalSummary: WithdrawalSummary
  withdrawalDatewise: WithdrawalDatewise[]
  period: { startDate: string; endDate: string }
}

// ── Wallet Balance Statement ─────────────────────────────────────────────────
export interface WalletBalanceRow {
  date: string
  hasSales: boolean
  totalSold: number
  totalWithdrawals: number
  totalDeposits: number
  totalProfit: number
  transactions: number
  openingBalance: number
  closingBalance: number
}

export interface WalletBalanceStatement {
  walletType: string
  walletBalance: number
  periodOpeningBalance: number
  periodClosingBalance: number
  rows: WalletBalanceRow[]
  period: { startDate: string; endDate: string }
}

// ── Repair Report ────────────────────────────────────────────────────────────
export interface RepairReportSummary {
  totalJobs: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalAdvance: number
  completedJobs: number
  deliveredJobs: number
  pendingJobs: number
}
export interface RepairByStatus {
  _id: string
  count: number
  revenue: number
  cost: number
}
export interface RepairDatewise {
  _id: string
  jobs: number
  revenue: number
  cost: number
  profit: number
}
export interface RepairByTechnician {
  _id: string
  jobs: number
  revenue: number
  cost: number
  profit: number
}
export interface RepairJob {
  _id: string
  customerName: string
  phone?: string
  deviceModel: string
  issue: string
  status: string
  charges: number
  cost: number
  technician?: string
  date: string
}
export interface RepairReport {
  summary: RepairReportSummary
  byStatus: RepairByStatus[]
  datewise: RepairDatewise[]
  byTechnician: RepairByTechnician[]
  recentJobs: RepairJob[]
  period: { startDate: string; endDate: string }
}

export const reportsApi = createApi({
  reducerPath: 'reportsApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['SalesReport', 'PurchaseReport', 'ProductReport', 'ProductDetailReport', 'CustomerReport', 'SupplierReport', 'ExpenseReport', 'ProfitLoss', 'Inventory', 'Tax', 'SalesReturnsReport', 'PurchaseReturnsReport', 'LoadReport', 'WalletBalanceStatement', 'RepairReport'],
  endpoints: (builder) => ({
    getSalesReport: builder.query<{
      data: SalesReportData[]
      summary: SalesReportSummary
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string; groupBy?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.groupBy) searchParams.set('groupBy', params.groupBy)
        return `/sales?${searchParams.toString()}`
      },
      providesTags: ['SalesReport'],
    }),
    getPurchaseReport: builder.query<{
      data: PurchaseReportData[]
      summary: any
      paymentBreakdown: { _id: string; count: number; totalAmount: number; paidAmount: number; balance: number }[]
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string; supplierId?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.supplierId) searchParams.set('supplierId', params.supplierId)
        return `/purchases?${searchParams.toString()}`
      },
      providesTags: ['PurchaseReport'],
    }),
    getProductReport: builder.query<{
      data: ProductReportData[]
      stockSummary: any
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string; categoryId?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.categoryId) searchParams.set('categoryId', params.categoryId)
        return `/products?${searchParams.toString()}`
      },
      providesTags: ['ProductReport'],
    }),
    getProductDetailReport: builder.query<{
      product: any
      summary: any
      sales: any[]
      purchases: any[]
      period: { startDate: string; endDate: string }
    }, { productId: string; startDate?: string; endDate?: string }>({
      query: ({ productId, ...params }) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/products/${productId}?${searchParams.toString()}`
      },
      providesTags: ['ProductDetailReport'],
    }),
    getCustomerReport: builder.query<{
      data: CustomerReportData[]
      summary: any
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string; top?: number }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.top) searchParams.set('top', params.top.toString())
        return `/customers?${searchParams.toString()}`
      },
      providesTags: ['CustomerReport'],
    }),
    getSupplierReport: builder.query<{
      data: SupplierReportData[]
      summary: any
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/suppliers?${searchParams.toString()}`
      },
      providesTags: ['SupplierReport'],
    }),
    getExpenseReport: builder.query<{
      data: ExpenseReportData[]
      categoryBreakdown: any[]
      summary: any
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string; category?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.category) searchParams.set('category', params.category)
        return `/expenses?${searchParams.toString()}`
      },
      providesTags: ['ExpenseReport'],
    }),
    getProfitLossReport: builder.query<ProfitLossReport, { startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/profit-loss?${searchParams.toString()}`
      },
      providesTags: ['ProfitLoss'],
    }),
    getInventoryReport: builder.query<{
      data: InventoryReportData[]
      summary: any
    }, { status?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.status) searchParams.set('status', params.status)
        return `/inventory?${searchParams.toString()}`
      },
      providesTags: ['Inventory'],
    }),
    getTaxReport: builder.query<{
      data: TaxReportData[]
      summary: any
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/tax?${searchParams.toString()}`
      },
      providesTags: ['Tax'],
    }),
    getSalesReturnsReport: builder.query<ReturnsReport, { startDate?: string; endDate?: string; customerId?: string; productId?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.customerId) searchParams.set('customerId', params.customerId)
        if (params.productId) searchParams.set('productId', params.productId)
        return `/sales-returns?${searchParams.toString()}`
      },
      providesTags: ['SalesReturnsReport'],
    }),
    getPurchaseReturnsReport: builder.query<ReturnsReport, { startDate?: string; endDate?: string; supplierId?: string; productId?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.supplierId) searchParams.set('supplierId', params.supplierId)
        if (params.productId) searchParams.set('productId', params.productId)
        return `/purchase-returns?${searchParams.toString()}`
      },
      providesTags: ['PurchaseReturnsReport'],
    }),
    getLoadReport: builder.query<LoadReport, { startDate?: string; endDate?: string; walletType?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.walletType) searchParams.set('walletType', params.walletType)
        return `/load?${searchParams.toString()}`
      },
      providesTags: ['LoadReport'],
    }),
    getWalletBalanceStatement: builder.query<WalletBalanceStatement, { walletType: string; startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        searchParams.set('walletType', params.walletType)
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/load/wallet-balance-statement?${searchParams.toString()}`
      },
      providesTags: ['WalletBalanceStatement'],
    }),
    getRepairReport: builder.query<RepairReport, { startDate?: string; endDate?: string; status?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.status) searchParams.set('status', params.status)
        return `/repair?${searchParams.toString()}`
      },
      providesTags: ['RepairReport'],
    }),
  }),
})

export const {
  useGetSalesReportQuery,
  useGetPurchaseReportQuery,
  useGetProductReportQuery,
  useGetProductDetailReportQuery,
  useGetCustomerReportQuery,
  useGetSupplierReportQuery,
  useGetExpenseReportQuery,
  useGetProfitLossReportQuery,
  useGetInventoryReportQuery,
  useGetTaxReportQuery,
  useGetSalesReturnsReportQuery,
  useGetPurchaseReturnsReportQuery,
  useGetLoadReportQuery,
  useGetWalletBalanceStatementQuery,
  useGetRepairReportQuery,
} = reportsApi
