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
    baseUrl: `${baseUrl}/invoices`,
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
    }),

    // Delete invoice
    deleteInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Invoice'],
    }),

    // Finalize invoice
    finalizeInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/finalize`,
        method: 'PATCH',
      }),
      invalidatesTags: ( id) => [{ type: 'Invoice', id }],
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
    }),

    // Duplicate invoice
    duplicateInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/duplicate`,
        method: 'POST',
      }),
      invalidatesTags: ['Invoice'],
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
  }),
})

export const {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useFinalizeInvoiceMutation,
  useProcessPaymentMutation,
  useCancelInvoiceMutation,
  useDuplicateInvoiceMutation,
  useGetInvoiceStatisticsQuery,
  useGetDailySalesReportQuery,
  useGetOutstandingInvoicesQuery,
  useGetInvoicesByCustomerQuery,
} = invoiceApi
