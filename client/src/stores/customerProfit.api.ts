import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/** Customer profitability — server: services/customerProfit.service.js, routes /customer-profit. */

export interface CustomerProfitMetrics {
  customerId: string
  invoices: number
  units: number
  revenue: number
  billDiscounts: number
  grossProfit: number
  returnsValue: number
  returnsProfit: number
  ledgerDiscount: number
  ledgerDiscountCount: number
  netRevenue: number
  cost: number
  netProfit: number
  margin: number
  avgProfitPerInvoice: number
  firstSaleAt: string | null
  lastSaleAt: string | null
}

export interface CustomerProfitRow extends CustomerProfitMetrics {
  rank: number
  name: string
  nameUrdu?: string
  phone?: string
  balance: number
  previousNetProfit: number
  /** % change vs the previous period of the same length; null = nothing to compare. */
  growth: number | null
}

export interface CustomerProfitRanking {
  period: { startDate: string; endDate: string; days: number }
  summary: {
    customers: number
    netRevenue: number
    cost: number
    grossProfit: number
    returnsProfit: number
    ledgerDiscount: number
    billDiscounts: number
    netProfit: number
    invoices: number
    margin: number
    lossMaking: number
    topShare: number
    topCount: number
    previousNetProfit: number
  }
  rows: CustomerProfitRow[]
}

export interface CustomerProfitDetail {
  customer: { id: string; name: string; nameUrdu?: string; phone?: string; balance: number }
  period: { startDate: string; endDate: string; days: number }
  metrics: CustomerProfitMetrics
  previous: CustomerProfitMetrics
  lifetime: CustomerProfitMetrics
  growth: number | null
  products: { productId: string | null; name: string; units: number; revenue: number; profit: number; margin: number; invoices: number }[]
  invoices: { id: string; invoiceNumber: string; date: string; type: string; revenue: number; profit: number; margin: number }[]
  lowMarginInvoices: CustomerProfitDetail['invoices']
  monthly: { month: string; revenue: number; profit: number; invoices: number }[]
}

export type CustomerProfitSort =
  | 'netProfit'
  | 'netRevenue'
  | 'margin'
  | 'invoices'
  | 'ledgerDiscount'
  | 'grossProfit'
  | 'growth'
  | 'lastSaleAt'
  | 'avgProfitPerInvoice'

export interface CustomerProfitQuery {
  startDate: string
  endDate: string
  search?: string
  sort?: CustomerProfitSort
  order?: 'asc' | 'desc'
  filter?: 'all' | 'loss' | 'discounted'
}

export const customerProfitApi = createApi({
  reducerPath: 'customerProfitApi',
  baseQuery,
  tagTypes: ['CustomerProfit'],
  keepUnusedDataFor: 120,
  endpoints: (builder) => ({
    getCustomerProfitRanking: builder.query<CustomerProfitRanking, CustomerProfitQuery>({
      query: (params) => ({
        url: '/customer-profit',
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')),
      }),
      providesTags: ['CustomerProfit'],
    }),
    getCustomerProfitDetail: builder.query<CustomerProfitDetail, { customerId: string; startDate: string; endDate: string }>({
      query: ({ customerId, ...params }) => ({ url: `/customer-profit/customers/${customerId}`, params }),
      providesTags: (_r, _e, arg) => [{ type: 'CustomerProfit', id: arg.customerId }, 'CustomerProfit'],
    }),
  }),
})

export const { useGetCustomerProfitRankingQuery, useGetCustomerProfitDetailQuery } = customerProfitApi
