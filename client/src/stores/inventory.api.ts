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
    baseUrl: `${baseUrl}/inventory`,
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

export interface Inventory {
  id?: string
  _id?: string
  organizationId?: string
  branchId?: string
  productId?: string
  variantId: string
  quantity: number
  reservedQuantity?: number
  averageCost?: number
  reorderLevel?: number
  reorderQty?: number
}

export const inventoryApi = createApi({
  reducerPath: 'inventoryApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Inventory'],
  endpoints: (builder) => ({
    // Read-only this phase — display per-variant stock only, no adjustment UI yet.
    getInventory: builder.query<Inventory, string>({
      query: (variantId) => `/${variantId}`,
      providesTags: (_r, _e, variantId) => [{ type: 'Inventory', id: variantId }],
    }),
  }),
})

export const { useGetInventoryQuery } = inventoryApi
