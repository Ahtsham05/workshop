import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'

/** Invoice mutations live in separate RTK Query slices from imeiApi/purchaseCatalogApi/
 *  batchApi, so a sale's effect on stock/IMEI status doesn't auto-invalidate the IMEI
 *  picker, the product catalog's stock+batch chips, or the per-variant batch list —
 *  those would otherwise stay stale until a full page reload. Force that refresh
 *  explicitly whenever an invoice is created/updated/deleted/cancelled/converted. */
const invalidateDownstreamCaches = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

// Custom base query with auth handling
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/invoices`,
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
    // Token might be expired, you could implement refresh logic here
    // For now, we'll just return the error
    console.error('Authentication failed. Please login again.')
  }
  
  return result
}

export const invoiceApi = createApi({
  reducerPath: 'invoiceApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Invoice'],
  endpoints: (builder) => ({
    // Create invoice
    createInvoice: builder.mutation({
      query: (invoiceData) => ({
        url: '',
        method: 'POST',
        body: invoiceData,
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Get all invoices
    getInvoices: builder.query({
      query: (params = {}) => ({
        url: '',
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Get invoice by ID
    getInvoiceById: builder.query({
      query: (id) => `/${id}`,
      providesTags: (id) => [{ type: 'Invoice', id }],
    }),

    // Update invoice
    updateInvoice: builder.mutation({
      query: ({ id, ...patch }) => ({
        url: `/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ( { id }) => [{ type: 'Invoice', id }, 'Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Delete invoice
    deleteInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Finalize invoice
    finalizeInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/finalize`,
        method: 'PATCH',
      }),
      invalidatesTags: ( id) => [{ type: 'Invoice', id }],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Process payment
    processPayment: builder.mutation({
      query: ({ id, paymentData }) => ({
        url: `/${id}/payment`,
        method: 'POST',
        body: paymentData,
      }),
      invalidatesTags: ( { id }) => [{ type: 'Invoice', id }],
    }),

    // Cancel invoice
    cancelInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/cancel`,
        method: 'PATCH',
      }),
      invalidatesTags: (id) => [{ type: 'Invoice', id }],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Duplicate invoice
    duplicateInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/duplicate`,
        method: 'POST',
      }),
      invalidatesTags: ['Invoice'],
    }),

    // Convert quotation to cash/credit invoice
    convertQuotation: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/${id}/convert-quotation`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Get invoice statistics
    getInvoiceStatistics: builder.query({
      query: (params = {}) => ({
        url: '/statistics',
        params,
      }),
    }),

    // Get daily sales report
    getDailySalesReport: builder.query({
      query: (date) => ({
        url: '/reports/daily',
        params: date ? { date } : {},
      }),
    }),

    // Get outstanding invoices
    getOutstandingInvoices: builder.query({
      query: (params = {}) => ({
        url: '/outstanding',
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Get invoices by customer
    getInvoicesByCustomer: builder.query({
      query: ({ customerId, ...params }) => ({
        url: `/customer/${customerId}`,
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Generate bill number
    generateBillNumber: builder.query({
      query: () => '/generate-bill-number',
    }),

    // Get customer product history
    getCustomerProductHistory: builder.query({
      query: ({ customerId, productId }) => ({
        url: `/customer/${customerId}/product/${productId}/history`,
      }),
    }),
  }),
})

export const {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  useLazyGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useFinalizeInvoiceMutation,
  useProcessPaymentMutation,
  useCancelInvoiceMutation,
  useDuplicateInvoiceMutation,
  useConvertQuotationMutation,
  useGetInvoiceStatisticsQuery,
  useGetDailySalesReportQuery,
  useGetOutstandingInvoicesQuery,
  useGetInvoicesByCustomerQuery,
  useGenerateBillNumberQuery,
  useGetCustomerProductHistoryQuery,
} = invoiceApi
