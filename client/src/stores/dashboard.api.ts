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
    baseUrl: `${baseUrl}/dashboard`,
    prepareHeaders: (headers) => {
      // Get token from localStorage (same way as existing Axios setup)
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
  
  // Handle 401 errors
  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.')
  }
  
  return result
}

export interface DashboardStats {
  totalRevenue: number
  totalRevenueChange: number
  totalSales: number
  totalSalesChange: number
  lowStockCount: number
  outOfStockCount: number
  totalInventoryValue: number
  pendingInvoices: number
  pendingInvoicesAmount: number
  todayRevenue: number
  todayRevenueChange: number
  totalCustomers: number
  totalProducts: number
  totalLoadSold: number
  totalLoadPurchased: number
  totalRepairIncome: number
  totalProfit: number
  cashInHand: number
  jazzcashBalance: number
  easypaisaBalance: number
  walletBalance: number
  totalSalesReturns: number
  totalPurchaseReturns: number
  netSales: number
  netPurchase: number
  totalBillCollection: number
  billPaymentProfit: number
  billsDueToday: number
  billsDueInPeriod: number
  billsOverdue: number
  totalSimSale?: number
  totalSimSaleProfit?: number
  simSaleCount?: number
  totalCashSend?: number
  totalCashSendProfit?: number
  cashSendCount?: number
  totalCashReceived?: number
  totalCashReceivedProfit?: number
  cashReceivedCount?: number
  totalServiceIncome?: number
  serviceInvoiceCount?: number
  period?: {
    preset: string
    startDate: string
    endDate: string
  }
}

export type DashboardDateParams = {
  period: 'today' | 'week' | 'month' | 'custom'
  startDate: string
  endDate: string
}

export interface RevenueData {
  date: string
  revenue: number
  sales: number
  profit: number
}

export interface TopProduct {
  id: string
  name: string
  image?: { url: string }
  totalQuantity: number
  totalRevenue: number
  stockQuantity: number
}

export interface TopCustomer {
  id: string
  name: string
  phone?: string
  totalPurchases: number
  totalAmount: number
  lastPurchase: string
}

export interface LowStockProduct {
  id: string
  name: string
  image?: { url: string }
  stockQuantity: number
  minStockLevel: number
  category: string
}

export interface RecentActivity {
  id: string
  type: 'invoice' | 'purchase' | 'payment'
  description: string
  amount: number
  /** Normalized for invoices (cash = total; credit = amount applied to invoice) */
  paidAmount?: number
  balance?: number
  timestamp: string
  status: string
}

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['DashboardStats', 'Revenue', 'TopProducts', 'TopCustomers', 'LowStock', 'RecentActivities'],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, DashboardDateParams>({
      query: (params) => ({
        url: '/stats',
        params,
      }),
      providesTags: ['DashboardStats'],
    }),
    getRevenueData: builder.query<RevenueData[], DashboardDateParams>({
      query: (params) => ({
        url: '/revenue',
        params,
      }),
      providesTags: ['Revenue'],
    }),
    getTopProducts: builder.query<TopProduct[], DashboardDateParams & { limit?: number }>({
      query: ({ limit = 5, ...params }) => ({
        url: '/top-products',
        params: { ...params, limit },
      }),
      providesTags: ['TopProducts'],
    }),
    getTopCustomers: builder.query<TopCustomer[], DashboardDateParams & { limit?: number }>({
      query: ({ limit = 5, ...params }) => ({
        url: '/top-customers',
        params: { ...params, limit },
      }),
      providesTags: ['TopCustomers'],
    }),
    getLowStockProducts: builder.query<LowStockProduct[], void>({
      query: () => '/low-stock',
      providesTags: ['LowStock'],
    }),
    getRecentActivities: builder.query<RecentActivity[], DashboardDateParams & { limit?: number }>({
      query: ({ limit = 10, ...params }) => ({
        url: '/recent-activities',
        params: { ...params, limit },
      }),
      providesTags: ['RecentActivities'],
    }),
  }),
})

export const {
  useGetDashboardStatsQuery,
  useGetRevenueDataQuery,
  useGetTopProductsQuery,
  useGetTopCustomersQuery,
  useGetLowStockProductsQuery,
  useGetRecentActivitiesQuery,
} = dashboardApi
