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

export interface SalesInvoiceItem {
  name: string
  nameUrdu?: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface SalesInvoiceDetail {
  _id: string
  invoiceNumber: string
  invoiceDate: string
  type: string
  status: string
  total: number
  paidAmount: number
  balance: number
  customerName: string
  customerNameUrdu?: string
  customerPhone: string
  items: SalesInvoiceItem[]
}

export interface SalesInvoiceDetailsSummary {
  totalSales: number
  totalInvoices: number
  totalItems: number
}

export interface PurchaseReportData {
  _id: {
    date: string
    supplier: string
  }
  supplierNameUrdu?: string
  totalAmount: number
  paidAmount: number
  balance: number
  purchaseCount: number
  cashPaid: number
  creditBalance: number
  paymentTypes: string[]
}

export interface PurchaseInvoiceItem {
  name: string
  nameUrdu?: string
  quantity: number
  unit?: string
  unitPrice: number
  subtotal: number
}

export interface PurchaseInvoiceDetail {
  _id: string
  invoiceNumber: string
  purchaseDate: string
  paymentType: string
  status: string
  totalAmount: number
  paidAmount: number
  balance: number
  supplierName: string
  supplierNameUrdu?: string
  supplierPhone?: string
  items: PurchaseInvoiceItem[]
}

export interface PurchaseInvoiceDetailsSummary {
  totalPurchases: number
  totalInvoices: number
  totalItems: number
}

export interface ProductReportData {
  _id: string
  productName: string
  productNameUrdu?: string
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
  customerNameUrdu?: string
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
  supplierNameUrdu?: string
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
  services: {
    totalServiceAmount: number
    totalServiceProfit: number
    totalServed: number
  }
  simSales: {
    totalSimSaleAmount: number
    totalSimSaleProfit: number
    totalSimSales: number
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
  nameUrdu?: string
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
  productNameUrdu?: string
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
  purchaseSavings: number
  netBalance: number
  simSaleLoadSold?: number
  simSaleTransactions?: number
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
  totalPurchaseProfit: number
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
  netWalletImpact?: number
  openingBalance: number
  closingBalance: number
  detailItems: WalletBalanceDetailItem[]
}

export interface WalletBalanceDetailItem {
  id: string
  date: string
  createdAt?: string
  source: 'load' | 'cash_withdrawal' | 'sim_sale' | 'load_purchase' | 'wallet_entry'
  transactionType: 'load_sale' | 'withdrawal' | 'deposit' | 'sim_sale_load' | 'load_purchase' | 'wallet_in' | 'wallet_out'
  title: string
  accountNumber: string
  customerName: string
  network: string
  customerAccountType?: string
  amount: number
  walletImpact: number
  cashAmount: number
  extraCharge: number
  profit: number
  paymentMethod: string
  notes: string
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

// ── Full Profit & Loss Report ────────────────────────────────────────────────
export interface ProfitLossFullReport {
  revenue: {
    totalRevenue: number
    salesReturns: number
    salesReturnsCount: number
    netRevenue: number
    costOfGoodsSold: number
    grossProfit: number
    grossProfitMargin: number
  }
  additionalProfits: {
    loadProfit: number
    repairProfit: number
    serviceProfit: number
    simSaleProfit: number
    billProfit: number
    withdrawalProfit: number
    depositProfit: number
  }
  adjustments: {
    purchaseReturns: number
    purchaseReturnsCount: number
  }
  expenses: number
  netProfit: number
  netProfitMargin: number
  roi: number
  investment: number
  inventoryValue: number
  walletBalance: number
  period: { from: string; to: string }
}

// ── ROI Report ───────────────────────────────────────────────────────────────
export interface RoiBreakdown {
  investment: {
    inventoryValue: number
    walletBalance: number
    expenses: number
    purchaseReturnsRecovery: number
  }
  profit: {
    salesProfit: number
    loadProfit: number
    repairProfit: number
    serviceProfit: number
    simSaleProfit: number
    billPaymentProfit: number
    withdrawalProfit: number
    depositProfit: number
    expenseDeduction: number
    salesReturnsImpact: number
  }
}

// ── Service Report ───────────────────────────────────────────────────────────
export interface ServiceReportSummary {
  totalInvoices: number
  totalAmount: number
  totalProfit: number
  avgInvoice: number
}

export interface ServiceReportByService {
  _id: string
  totalQuantity: number
  totalAmount: number
  avgUnitPrice: number
}

export interface ServiceReportByPaymentMethod {
  _id: string
  count: number
  totalAmount: number
}

export interface ServiceReportDatewise {
  _id: string
  invoices: number
  totalAmount: number
}

export interface ServiceReportRecent {
  _id: string
  invoiceNumber: string
  customerName?: string
  customerPhone?: string
  items: { serviceName: string; quantity: number; total: number }[]
  totalAmount: number
  paymentMethod: string
  date: string
}

export interface ServiceReport {
  summary: ServiceReportSummary
  byService: ServiceReportByService[]
  byPaymentMethod: ServiceReportByPaymentMethod[]
  datewise: ServiceReportDatewise[]
  recentInvoices: ServiceReportRecent[]
  period: { startDate: string; endDate: string }
}

export interface RoiReport {
  investment: number
  inventoryValue: number
  walletBalance: number
  profit: number
  roi: number
  breakdown: RoiBreakdown
  period: { from: string; to: string }
}

export interface MonthlyRoiPoint {
  month: string
  investment: number
  profit: number
  roi: number
}

export interface MonthlyRoiReport {
  monthly: MonthlyRoiPoint[]
  period: { from: string; to: string }
}


// ── Sim Sale Report ──────────────────────────────────────────────────────────
export interface SimSaleReportSummary {
  totalSales: number
  totalSimAmount: number
  totalLoadAmount: number
  totalPurchaseAmount: number
  totalSaleAmount: number
  totalCommission: number
}
export interface SimSaleByProduct {
  _id: string
  productNameUrdu?: string
  count: number
  totalSaleAmount: number
  totalSimAmount: number
  totalLoadAmount: number
  totalCommission: number
}
export interface SimSaleByWallet {
  _id: string
  count: number
  totalLoadAmount: number
}
export interface SimSaleDatewise {
  _id: string
  count: number
  totalSaleAmount: number
  totalCommission: number
  totalLoadAmount: number
}
export interface SimSaleRecentRecord {
  _id: string
  productName: string
  productNameUrdu?: string
  customerName?: string
  customerNameUrdu?: string
  customerMobile?: string
  customerCNIC?: string
  simAmount: number
  loadAmount: number
  saleAmount: number
  commission: number
  paymentMethod: string
  paymentWalletType?: string
  walletType?: string
  date: string
}
export interface SimSaleReport {
  summary: SimSaleReportSummary
  byProduct: SimSaleByProduct[]
  byWallet: SimSaleByWallet[]
  datewise: SimSaleDatewise[]
  recentSales: SimSaleRecentRecord[]
  productSales?: SimSaleRecentRecord[]
  period: { startDate: string; endDate: string }
}

// ── Installment Report ───────────────────────────────────────────────────────
export interface InstallmentPlanSummary {
  totalPlans: number
  totalAmount: number
  totalPaid: number
  totalOutstanding: number
  totalDownPayment: number
}
export interface InstallmentByStatus {
  _id: string
  count: number
  totalAmount: number
  totalOutstanding: number
  totalPaid: number
}
export interface InstallmentPaymentSummaryData {
  totalPayments: number
  totalCollected: number
}
export interface InstallmentPaymentDatewiseItem {
  _id: string
  payments: number
  totalCollected: number
}
export interface InstallmentPlanRecord {
  _id: string
  planNumber: string
  customerName: string
  customerPhone?: string
  itemDescription: string
  totalAmount: number
  totalPaid: number
  totalOutstanding: number
  status: string
  nextDueDate?: string
  startDate: string
}
export interface InstallmentReport {
  planSummary: InstallmentPlanSummary
  byStatus: InstallmentByStatus[]
  paymentSummary: InstallmentPaymentSummaryData
  paymentDatewise: InstallmentPaymentDatewiseItem[]
  overdueCount: number
  recentPlans: InstallmentPlanRecord[]
  period: { startDate: string; endDate: string }
}
export const reportsApi = createApi({
  reducerPath: 'reportsApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['SalesReport', 'PurchaseReport', 'ProductReport', 'ProductDetailReport', 'CustomerReport', 'SupplierReport', 'ExpenseReport', 'ProfitLoss', 'ProfitLossFull', 'Inventory', 'Tax', 'SalesReturnsReport', 'PurchaseReturnsReport', 'LoadReport', 'WalletBalanceStatement', 'RepairReport', 'ServiceReport', 'RoiReport', 'MonthlyRoi', 'SimSaleReport', 'InstallmentReport'],
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
    getSalesInvoiceDetails: builder.query<{
      invoices: SalesInvoiceDetail[]
      summary: SalesInvoiceDetailsSummary
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/sales/invoices?${searchParams.toString()}`
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
    getPurchaseInvoiceDetails: builder.query<{
      purchases: PurchaseInvoiceDetail[]
      summary: PurchaseInvoiceDetailsSummary
      period: { startDate: string; endDate: string }
    }, { startDate?: string; endDate?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        return `/purchases/invoices?${searchParams.toString()}`
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
      categoryBreakdown: { _id: string; totalAmount: number; expenseCount: number; avgAmount: number }[]
      categoryExpenses: {
        _id: string; expenseNumber: string; category: string; description: string
        amount: number; paymentMethod: string; date: string; vendor?: string; reference?: string; notes?: string
      }[]
      summary: { totalExpenses: number; expenseCount: number; avgExpense: number }
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
    getProfitLossFullReport: builder.query<ProfitLossFullReport, { from?: string; to?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.from) searchParams.set('from', params.from)
        if (params.to) searchParams.set('to', params.to)
        return `/profit-loss-full?${searchParams.toString()}`
      },
      providesTags: ['ProfitLossFull'],
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
    getServiceReport: builder.query<ServiceReport, { startDate?: string; endDate?: string; serviceName?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.serviceName) searchParams.set('serviceName', params.serviceName)
        return `/services?${searchParams.toString()}`
      },
      providesTags: ['ServiceReport'],
    }),
    getRoiReport: builder.query<RoiReport, { from?: string; to?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.from) searchParams.set('from', params.from)
        if (params.to) searchParams.set('to', params.to)
        return `/roi?${searchParams.toString()}`
      },
      providesTags: ['RoiReport'],
    }),
    getMonthlyRoi: builder.query<MonthlyRoiReport, { from?: string; to?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.from) searchParams.set('from', params.from)
        if (params.to) searchParams.set('to', params.to)
        return `/roi/monthly?${searchParams.toString()}`
      },
      providesTags: ['MonthlyRoi'],
    }),
    getSimSaleReport: builder.query<SimSaleReport, { startDate?: string; endDate?: string; productId?: string; walletType?: string; productName?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.productId) searchParams.set('productId', params.productId)
        if (params.walletType) searchParams.set('walletType', params.walletType)
        if (params.productName) searchParams.set('productName', params.productName)
        return `/sim-sales?${searchParams.toString()}`
      },
      providesTags: ['SimSaleReport'],
    }),
    getInstallmentReport: builder.query<InstallmentReport, { startDate?: string; endDate?: string; status?: string }>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params.startDate) searchParams.set('startDate', params.startDate)
        if (params.endDate) searchParams.set('endDate', params.endDate)
        if (params.status) searchParams.set('status', params.status)
        return `/installments?${searchParams.toString()}`
      },
      providesTags: ['InstallmentReport'],
    }),
  }),
})

export const {
  useGetSalesReportQuery,
  useGetSalesInvoiceDetailsQuery,
  useGetPurchaseReportQuery,
  useGetPurchaseInvoiceDetailsQuery,
  useGetProductReportQuery,
  useGetProductDetailReportQuery,
  useGetCustomerReportQuery,
  useGetSupplierReportQuery,
  useGetExpenseReportQuery,
  useLazyGetExpenseReportQuery,
  useGetProfitLossReportQuery,
  useGetProfitLossFullReportQuery,
  useGetInventoryReportQuery,
  useGetTaxReportQuery,
  useGetSalesReturnsReportQuery,
  useGetPurchaseReturnsReportQuery,
  useGetLoadReportQuery,
  useGetWalletBalanceStatementQuery,
  useGetRepairReportQuery,
  useGetServiceReportQuery,
  useLazyGetServiceReportQuery,
  useGetRoiReportQuery,
  useGetMonthlyRoiQuery,
  useGetSimSaleReportQuery,
  useLazyGetSimSaleReportQuery,
  useGetInstallmentReportQuery,
} = reportsApi
