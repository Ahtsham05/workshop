import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { imeiApi } from './imei.api'

/** Purchase mutations live in a separate RTK Query slice from imeiApi, so receiving/editing
 *  stock doesn't auto-invalidate the IMEI picker's cache. Force that refresh explicitly. */
const invalidateImeiCache = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
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
    baseUrl: `${baseUrl}/purchases`,
    prepareHeaders: (headers) => {
      // Get token from localStorage
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

export const purchaseApi = createApi({
  reducerPath: 'purchaseApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Purchase'],
  endpoints: (builder) => ({
    // Create purchase
    createPurchase: builder.mutation({
      query: (purchaseData) => ({
        url: '',
        method: 'POST',
        body: purchaseData,
      }),
      invalidatesTags: ['Purchase'],
      onQueryStarted: invalidateImeiCache,
    }),

    // Get all purchases
    getPurchases: builder.query({
      query: (params = {}) => ({
        url: '',
        params,
      }),
      providesTags: ['Purchase'],
    }),

    // Get purchase by ID
    getPurchaseById: builder.query({
      query: (id) => `/${id}`,
      providesTags: (id) => [{ type: 'Purchase', id }],
    }),

    // Update purchase
    updatePurchase: builder.mutation({
      query: ({ id, data }) => ({
        url: `/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ({ id }) => [{ type: 'Purchase', id }, 'Purchase'],
      onQueryStarted: invalidateImeiCache,
    }),

    // Delete purchase
    deletePurchase: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Purchase'],
      onQueryStarted: invalidateImeiCache,
    }),

    // Get purchase statistics
    getPurchaseStatistics: builder.query({
      query: (params = {}) => ({
        url: '/statistics',
        params,
      }),
    }),

    // Get purchases by date range
    getPurchasesByDate: builder.query({
      query: ({ startDate, endDate }) => ({
        url: '/date',
        params: { startDate, endDate },
      }),
      providesTags: ['Purchase'],
    }),

    // Get purchases by supplier
    getPurchasesBySupplier: builder.query({
      query: ({ supplierId, ...params }) => ({
        url: `/supplier/${supplierId}`,
        params,
      }),
      providesTags: ['Purchase'],
    }),
  }),
})

export const {
  useCreatePurchaseMutation,
  useGetPurchasesQuery,
  useGetPurchaseByIdQuery,
  useUpdatePurchaseMutation,
  useDeletePurchaseMutation,
  useGetPurchaseStatisticsQuery,
  useGetPurchasesByDateQuery,
  useGetPurchasesBySupplierQuery,
} = purchaseApi
