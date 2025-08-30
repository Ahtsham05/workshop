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
    baseUrl: baseUrl,
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

export const returnApi = createApi({
  reducerPath: 'returnApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Return'],
  endpoints: (builder) => ({
    // Create return
    createReturn: builder.mutation({
      query: (returnData) => ({
        url: '/returns',
        method: 'POST',
        body: returnData,
      }),
      invalidatesTags: ['Return'],
    }),

    // Get all returns
    getReturns: builder.query({
      query: (params = {}) => ({
        url: '/returns',
        params,
      }),
      transformResponse: (response: any) => response.results || [],
      providesTags: ['Return'],
    }),

    // Get return by ID
    getReturnById: builder.query({
      query: (id) => `/returns/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Return', id }],
    }),

    // Update return
    updateReturn: builder.mutation({
      query: ({ id, ...patch }) => ({
        url: `/returns/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Return', id }],
    }),

    // Delete return
    deleteReturn: builder.mutation({
      query: (id) => ({
        url: `/returns/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Return'],
    }),

    // Approve return
    approveReturn: builder.mutation({
      query: (id) => ({
        url: `/returns/${id}/approve`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Return', id }],
    }),

    // Reject return
    rejectReturn: builder.mutation({
      query: ({ id, reason }) => ({
        url: `/returns/${id}/reject`,
        method: 'PATCH',
        body: { reason },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Return', id }],
    }),

    // Process return
    processReturn: builder.mutation({
      query: (id) => ({
        url: `/returns/${id}/process`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Return', id }],
    }),

    // Get returns by invoice
    getReturnsByInvoice: builder.query({
      query: ({ invoiceId, ...params }) => ({
        url: `/returns/invoice/${invoiceId}`,
        params,
      }),
      transformResponse: (response: any) => response.results || [],
      providesTags: ['Return'],
    }),

    // Get returns by customer
    getReturnsByCustomer: builder.query({
      query: ({ customerId, ...params }) => ({
        url: `/returns/customer/${customerId}`,
        params,
      }),
      transformResponse: (response: any) => response.results || [],
      providesTags: ['Return'],
    }),

    // Get return statistics
    getReturnStatistics: builder.query({
      query: (params = {}) => ({
        url: '/returns/statistics',
        params,
      }),
    }),
  }),
})

export const {
  useCreateReturnMutation,
  useGetReturnsQuery,
  useGetReturnByIdQuery,
  useUpdateReturnMutation,
  useDeleteReturnMutation,
  useApproveReturnMutation,
  useRejectReturnMutation,
  useProcessReturnMutation,
  useGetReturnsByInvoiceQuery,
  useGetReturnsByCustomerQuery,
  useGetReturnStatisticsQuery,
} = returnApi
