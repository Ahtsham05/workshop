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

const categoryTagId = (transactionType?: TransactionCategoryType) =>
  transactionType ?? 'business_expense'

function normalizeExpenseCategories(response: unknown): ExpenseCategory[] {
  if (Array.isArray(response)) return response as ExpenseCategory[]
  if (response && typeof response === 'object' && Array.isArray((response as { results?: unknown }).results)) {
    return (response as { results: ExpenseCategory[] }).results
  }
  return []
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
      transformResponse: normalizeExpenseCategories,
      serializeQueryArgs: ({ queryArgs }) => categoryTagId(queryArgs?.transactionType),
      providesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg?.transactionType) },
      ],
      keepUnusedDataFor: 300,
    }),
    createExpenseCategory: builder.mutation<
      ExpenseCategory,
      { name: string; color?: string; transactionType?: TransactionCategoryType }
    >({
      query: (body) => ({ url: '/expense-categories', method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg?.transactionType) },
      ],
    }),
    updateExpenseCategory: builder.mutation<
      ExpenseCategory,
      { id: string; name?: string; color?: string; transactionType?: TransactionCategoryType }
    >({
      query: ({ id, ...body }) => ({ url: `/expense-categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg?.transactionType) },
      ],
    }),
    deleteExpenseCategory: builder.mutation<
      void,
      { id: string; transactionType?: TransactionCategoryType }
    >({
      query: ({ id }) => ({ url: `/expense-categories/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg.transactionType) },
      ],
    }),
  }),
})

export const {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
} = expenseCategoryApi
