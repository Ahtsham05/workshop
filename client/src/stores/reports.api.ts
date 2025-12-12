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
    costOfGoodsSold: number
    grossProfit: number
    grossProfitMargin: number
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

export const reportsApi = createApi({
  reducerPath: 'reportsApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['SalesReport', 'PurchaseReport', 'ProductReport', 'ProductDetailReport', 'CustomerReport', 'SupplierReport', 'ExpenseReport', 'ProfitLoss', 'Inventory', 'Tax'],
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
} = reportsApi
