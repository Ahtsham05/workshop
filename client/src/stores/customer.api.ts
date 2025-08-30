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
    baseUrl: `${baseUrl}/customers`,
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

export const customerApi = createApi({
  reducerPath: 'customerApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Customer'],
  endpoints: (builder) => ({
    // Get customers with pagination and search
    getCustomers: builder.query({
      query: (params = {}) => {
        const searchParams = new URLSearchParams()
        
        if (params.page) searchParams.set('page', params.page.toString())
        if (params.limit) searchParams.set('limit', params.limit.toString())
        if (params.search) searchParams.set('search', params.search)
        if (params.sortBy) searchParams.set('sortBy', params.sortBy)
        if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder)
        
        const queryString = searchParams.toString()
        return queryString ? `?${queryString}` : ''
      },
      providesTags: ['Customer'],
    }),

    // Get single customer by ID
    getCustomerById: builder.query({
      query: (id) => `/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Customer', id }],
    }),

    // Create customer
    createCustomer: builder.mutation({
      query: (customerData) => ({
        url: '',
        method: 'POST',
        body: customerData,
      }),
      invalidatesTags: ['Customer'],
    }),

    // Update customer
    updateCustomer: builder.mutation({
      query: ({ id, ...customerData }) => ({
        url: `/${id}`,
        method: 'PATCH',
        body: customerData,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Customer', id },
        'Customer',
      ],
    }),

    // Delete customer
    deleteCustomer: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Customer', id },
        'Customer',
      ],
    }),

    // Get all customers (for dropdowns)
    getAllCustomers: builder.query({
      query: () => '/all',
      providesTags: ['Customer'],
    }),
  }),
})

export const {
  useGetCustomersQuery,
  useGetCustomerByIdQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useGetAllCustomersQuery,
} = customerApi

export default customerApi
