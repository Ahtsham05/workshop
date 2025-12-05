import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: `${baseUrl}/company`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) {
        headers.set('authorization', `Bearer ${token}`)
      }
      return headers
    },
  })

  const result = await baseQuery(args, api, extraOptions)

  // Only log errors that are not 404 (404 is handled gracefully in queryFn)
  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.')
  }

  return result
}

export interface Company {
  _id: string
  name: string
  email: string
  phone?: string
  address?: string
  city?: string
  country?: string
  taxNumber?: string
  logo?: {
    url?: string
    publicId?: string
  }
  createdAt: string
  updatedAt: string
}

export interface CompanyInput {
  name: string
  email: string
  password: string
  phone?: string
  address?: string
  city?: string
  country?: string
  taxNumber?: string
}

export interface CompanyUpdate {
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  taxNumber?: string
}

export interface ChangePasswordInput {
  oldPassword: string
  newPassword: string
}

export const companyApi = createApi({
  reducerPath: 'companyApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Company'],
  endpoints: (builder) => ({
    getCompany: builder.query<Company | null, void>({
      queryFn: async (_arg, _queryApi, _extraOptions, fetchWithBQ) => {
        const result = await fetchWithBQ('/')
        if (result.error && result.error.status === 404) {
          // Return null data for 404 instead of treating it as an error
          return { data: null }
        }
        if (result.error) {
          return { error: result.error }
        }
        return { data: result.data as Company }
      },
      providesTags: ['Company'],
    }),
    createCompany: builder.mutation<Company, CompanyInput>({
      query: (body) => ({
        url: '/',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Company'],
    }),
    updateCompany: builder.mutation<Company, CompanyUpdate>({
      query: (body) => ({
        url: '/',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Company'],
    }),
    changePassword: builder.mutation<void, ChangePasswordInput>({
      query: (body) => ({
        url: '/change-password',
        method: 'POST',
        body,
      }),
    }),
    deleteCompany: builder.mutation<void, void>({
      query: () => ({
        url: '/',
        method: 'DELETE',
      }),
      invalidatesTags: ['Company'],
    }),
  }),
})

export const {
  useGetCompanyQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useChangePasswordMutation,
  useDeleteCompanyMutation,
} = companyApi
