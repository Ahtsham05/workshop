import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface CustomerAccountType {
  id: string
  _id?: string
  name: string
  slug: string
  color: string
  isDefault: boolean
}

export const customerAccountTypeApi = createApi({
  reducerPath: 'customerAccountTypeApi',
  baseQuery,
  tagTypes: ['CustomerAccountType'],
  endpoints: (builder) => ({
    getCustomerAccountTypes: builder.query<CustomerAccountType[], void>({
      query: () => ({ url: '/customer-account-types' }),
      providesTags: ['CustomerAccountType'],
    }),
    createCustomerAccountType: builder.mutation<
      CustomerAccountType,
      { name: string; color?: string }
    >({
      query: (body) => ({ url: '/customer-account-types', method: 'POST', body }),
      invalidatesTags: ['CustomerAccountType'],
    }),
    updateCustomerAccountType: builder.mutation<
      CustomerAccountType,
      { id: string; name?: string; color?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/customer-account-types/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['CustomerAccountType'],
    }),
    deleteCustomerAccountType: builder.mutation<void, string>({
      query: (id) => ({ url: `/customer-account-types/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CustomerAccountType'],
    }),
  }),
})

export const {
  useGetCustomerAccountTypesQuery,
  useCreateCustomerAccountTypeMutation,
  useUpdateCustomerAccountTypeMutation,
  useDeleteCustomerAccountTypeMutation,
} = customerAccountTypeApi
