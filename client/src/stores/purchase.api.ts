import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'

/** Purchase mutations live in separate RTK Query slices from imeiApi/purchaseCatalogApi/
 *  batchApi, so receiving/editing/deleting a purchase doesn't auto-invalidate the IMEI
 *  picker, the product catalog's stock+batch chips, or the per-variant batch list —
 *  those would otherwise stay stale until a full page reload. Force that refresh
 *  explicitly on every mutation that can change stock or create/restock a batch. */
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
      onQueryStarted: invalidateDownstreamCaches,
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
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Delete purchase
    deletePurchase: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Purchase'],
      onQueryStarted: invalidateDownstreamCaches,
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
