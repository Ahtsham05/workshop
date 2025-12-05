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
  pendingInvoices: number
  pendingInvoicesAmount: number
  todayRevenue: number
  todayRevenueChange: number
  totalCustomers: number
  totalProducts: number
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
  timestamp: string
  status: string
}

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['DashboardStats', 'Revenue', 'TopProducts', 'TopCustomers', 'LowStock', 'RecentActivities'],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => '/stats',
      providesTags: ['DashboardStats'],
    }),
    getRevenueData: builder.query<RevenueData[], { period: 'day' | 'week' | 'month' | 'year' }>({
      query: ({ period }) => `/revenue?period=${period}`,
      providesTags: ['Revenue'],
    }),
    getTopProducts: builder.query<TopProduct[], { limit?: number }>({
      query: ({ limit = 5 }) => `/top-products?limit=${limit}`,
      providesTags: ['TopProducts'],
    }),
    getTopCustomers: builder.query<TopCustomer[], { limit?: number }>({
      query: ({ limit = 5 }) => `/top-customers?limit=${limit}`,
      providesTags: ['TopCustomers'],
    }),
    getLowStockProducts: builder.query<LowStockProduct[], void>({
      query: () => '/low-stock',
      providesTags: ['LowStock'],
    }),
    getRecentActivities: builder.query<RecentActivity[], { limit?: number }>({
      query: ({ limit = 10 }) => `/recent-activities?limit=${limit}`,
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
