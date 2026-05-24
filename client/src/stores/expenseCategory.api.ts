import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type TransactionCategoryType =
  | 'business_expense'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'opening_balance'
  | 'adjustment'

export interface ExpenseCategory {
  id: string
  _id?: string
  name: string
  color: string
  isDefault: boolean
  transactionType?: TransactionCategoryType
}

export const expenseCategoryApi = createApi({
  reducerPath: 'expenseCategoryApi',
  baseQuery,
  tagTypes: ['ExpenseCategory'],
  endpoints: (builder) => ({
    getExpenseCategories: builder.query<
      ExpenseCategory[],
      { transactionType?: TransactionCategoryType } | void
    >({
      query: (params) => ({
        url: '/expense-categories',
        params: params?.transactionType ? { transactionType: params.transactionType } : undefined,
      }),
      providesTags: ['ExpenseCategory'],
    }),
    createExpenseCategory: builder.mutation<
      ExpenseCategory,
      { name: string; color?: string; transactionType?: TransactionCategoryType }
    >({
      query: (body) => ({ url: '/expense-categories', method: 'POST', body }),
      invalidatesTags: ['ExpenseCategory'],
    }),
    updateExpenseCategory: builder.mutation<
      ExpenseCategory,
      { id: string; name?: string; color?: string; transactionType?: TransactionCategoryType }
    >({
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
