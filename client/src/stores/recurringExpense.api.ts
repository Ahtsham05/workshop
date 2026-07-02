import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export interface RecurringExpenseRecord {
  id: string
  name: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  walletType?: string
  vendor?: string
  frequency: RecurringFrequency
  dayOfWeek?: number
  dayOfMonth?: number
  startDate: string
  endDate?: string | null
  isActive: boolean
  lastGeneratedDate?: string | null
  nextRunDate: string
  totalGenerated: number
  createdAt: string
}

export interface CreateRecurringExpenseInput {
  name: string
  category: string
  description: string
  amount: number
  paymentMethod?: string
  walletType?: string
  vendor?: string
  frequency: RecurringFrequency
  dayOfWeek?: number
  dayOfMonth?: number
  startDate: string
  endDate?: string | null
}

export interface UpdateRecurringExpenseInput extends Partial<CreateRecurringExpenseInput> {
  isActive?: boolean
}

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const recurringExpenseApi = createApi({
  reducerPath: 'recurringExpenseApi',
  baseQuery,
  tagTypes: ['RecurringExpenses'],
  endpoints: (builder) => ({
    getRecurringExpenses: builder.query<PaginatedResult<RecurringExpenseRecord>, { isActive?: boolean } | void>({
      query: (params) => ({
        url: '/recurring-expenses',
        params: params || {},
      }),
      providesTags: ['RecurringExpenses'],
    }),
    createRecurringExpense: builder.mutation<RecurringExpenseRecord, CreateRecurringExpenseInput>({
      query: (body) => ({ url: '/recurring-expenses', method: 'POST', body }),
      invalidatesTags: ['RecurringExpenses'],
    }),
    updateRecurringExpense: builder.mutation<RecurringExpenseRecord, { id: string } & UpdateRecurringExpenseInput>({
      query: ({ id, ...body }) => ({ url: `/recurring-expenses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['RecurringExpenses'],
    }),
    deleteRecurringExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/recurring-expenses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RecurringExpenses'],
    }),
    runRecurringExpensesNow: builder.mutation<{ created: number; errors: number; total: number }, void>({
      query: () => ({ url: '/recurring-expenses/run-now', method: 'POST' }),
    }),
  }),
})

export const {
  useGetRecurringExpensesQuery,
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  useDeleteRecurringExpenseMutation,
  useRunRecurringExpensesNowMutation,
} = recurringExpenseApi
