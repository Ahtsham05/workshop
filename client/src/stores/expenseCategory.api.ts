import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface ExpenseCategory {
  id: string
  name: string
  color: string
  isDefault: boolean
}

export const expenseCategoryApi = createApi({
  reducerPath: 'expenseCategoryApi',
  baseQuery,
  tagTypes: ['ExpenseCategory'],
  endpoints: (builder) => ({
    getExpenseCategories: builder.query<ExpenseCategory[], void>({
      query: () => '/expense-categories',
      providesTags: ['ExpenseCategory'],
    }),
    createExpenseCategory: builder.mutation<ExpenseCategory, { name: string; color?: string }>({
      query: (body) => ({ url: '/expense-categories', method: 'POST', body }),
      invalidatesTags: ['ExpenseCategory'],
    }),
    updateExpenseCategory: builder.mutation<ExpenseCategory, { id: string; name?: string; color?: string }>({
      query: ({ id, ...body }) => ({ url: `/expense-categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ExpenseCategory'],
    }),
    deleteExpenseCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/expense-categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ExpenseCategory'],
    }),
  }),
})

export const {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
} = expenseCategoryApi
