import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/batches`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) headers.set('authorization', `Bearer ${token}`)
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) headers.set('x-branch-id', activeBranchId)
      return headers
    },
  })

  return baseQuery(args, api, extraOptions)
}

export interface Batch {
  id?: string
  _id?: string
  organizationId?: string
  inventoryId?: string
  batchNumber: string
  quantity: number
  costPerUnit: number
  manufactureDate?: string
  expiryDate?: string
  supplierId?: string
  status?: 'active' | 'depleted' | 'expired' | 'written_off'
  createdAt?: string
}

export interface CreateBatchBody {
  batchNumber: string
  quantity: number
  costPerUnit: number
  manufactureDate?: string
  expiryDate?: string
  supplierId?: string
}

export const batchApi = createApi({
  reducerPath: 'batchApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Batch'],
  endpoints: (builder) => ({
    getBatchesForVariant: builder.query<Batch[], string>({
      query: (variantId) => `/variant/${variantId}`,
      providesTags: (result, _err, variantId) =>
        result
          ? [
              ...result.map((b) => ({ type: 'Batch' as const, id: b._id || b.id })),
              { type: 'Batch' as const, id: `LIST-${variantId}` },
            ]
          : [{ type: 'Batch' as const, id: `LIST-${variantId}` }],
    }),

    getExpiringBatches: builder.query<Batch[], number | void>({
      query: (days) => ({ url: '/expiring', params: days ? { days } : undefined }),
      providesTags: [{ type: 'Batch', id: 'EXPIRING' }],
    }),

    createBatch: builder.mutation<Batch, { variantId: string; data: CreateBatchBody }>({
      query: ({ variantId, data }) => ({ url: `/variant/${variantId}`, method: 'POST', body: data }),
      invalidatesTags: (_r, _e, { variantId }) => [
        { type: 'Batch', id: `LIST-${variantId}` },
        { type: 'Batch', id: 'EXPIRING' },
      ],
    }),

    writeOffBatch: builder.mutation<Batch, { batchId: string; variantId: string; reason?: string }>({
      query: ({ batchId, reason }) => ({ url: `/${batchId}/write-off`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { variantId }) => [
        { type: 'Batch', id: `LIST-${variantId}` },
        { type: 'Batch', id: 'EXPIRING' },
      ],
    }),
  }),
})

export const {
  useGetBatchesForVariantQuery,
  useGetExpiringBatchesQuery,
  useCreateBatchMutation,
  useWriteOffBatchMutation,
} = batchApi
