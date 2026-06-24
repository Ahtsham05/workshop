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
    baseUrl: `${baseUrl}/product-attributes`,
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

export interface ProductAttribute {
  id?: string
  _id?: string
  organizationId?: string
  name: string
  values: string[]
  businessTypes?: string[]
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export const productAttributeApi = createApi({
  reducerPath: 'productAttributeApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['ProductAttribute'],
  endpoints: (builder) => ({
    getAllProductAttributes: builder.query<ProductAttribute[], void>({
      query: () => '/all',
      providesTags: [{ type: 'ProductAttribute', id: 'LIST' }],
    }),

    createProductAttribute: builder.mutation<ProductAttribute, Partial<ProductAttribute>>({
      query: (body) => ({ url: '', method: 'POST', body }),
      invalidatesTags: [{ type: 'ProductAttribute', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetAllProductAttributesQuery,
  useCreateProductAttributeMutation,
} = productAttributeApi
