import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type TransactionCategoryType =
  | 'business_expense'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'opening_balance'
  | 'adjustment'

/**
 * Accounting classification of a business-expense category.
 *  direct   — part of the cost of what is sold (freight inward, direct labour, factory
 *             power, packing). Reduces GROSS profit; posts under Cost of Sales.
 *  indirect — cost of running the business (rent, office salaries, marketing).
 *             Reduces NET profit only. Default for every existing category.
 */
export type ExpenseNature = 'direct' | 'indirect'

export interface ExpenseCategory {
  id: string
  _id?: string
  name: string
  color: string
  isDefault: boolean
  transactionType?: TransactionCategoryType
  expenseNature?: ExpenseNature
  /** Chart-of-accounts code this category posts to; empty = default ledger for its type. */
  accountCode?: string | null
  description?: string
  /** false = retired: hidden from the Add Expense picker; history untouched. Missing = active. */
  isActive?: boolean
}

export interface ExpenseCategoryUpdateResult extends ExpenseCategory {
  /** Present when the type/account changed and existing expenses were moved with it. */
  reclassified?: { updated: number; reposted: number }
}

/** Lower-cased category name → how many expenses / recurring rules use it. */
export type ExpenseCategoryUsage = Record<string, { expenses: number; total: number; recurringRules: number }>

export const usageOf = (usage: ExpenseCategoryUsage | undefined, name: string) =>
  usage?.[name.trim().toLowerCase()] ?? { expenses: 0, total: 0, recurringRules: 0 }

export const expenseNatureOf = (category?: Pick<ExpenseCategory, 'expenseNature'> | null): ExpenseNature =>
  category?.expenseNature === 'direct' ? 'direct' : 'indirect'

/**
 * Renaming, re-classifying or deleting-with-move a business-expense category rewrites
 * saved expenses, so the expense list (expenseApi) and the expense / P&L reports
 * (reportsApi) must refresh too. Lazy imports: expense.api.ts imports this file.
 */
const refreshExpenseViewsAfter = async (
  arg: { transactionType?: TransactionCategoryType } | undefined,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled
  } catch {
    return
  }
  if ((arg?.transactionType ?? 'business_expense') !== 'business_expense') return
  const [{ expenseApi }, { reportsApi }] = await Promise.all([import('./expense.api'), import('./reports.api')])
  dispatch(expenseApi.util.invalidateTags(['Expenses']))
  dispatch(reportsApi.util.invalidateTags(['ExpenseReport', 'ProfitLoss', 'ProfitLossFull']))
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
  tagTypes: ['ExpenseCategory', 'ExpenseCategoryUsage'],
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
      {
        name: string
        color?: string
        transactionType?: TransactionCategoryType
        expenseNature?: ExpenseNature
        accountCode?: string | null
        description?: string
      }
    >({
      query: (body) => ({ url: '/expense-categories', method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg?.transactionType) },
      ],
    }),
    updateExpenseCategory: builder.mutation<
      ExpenseCategoryUpdateResult,
      {
        id: string
        name?: string
        color?: string
        transactionType?: TransactionCategoryType
        expenseNature?: ExpenseNature
        accountCode?: string | null
        description?: string
        isActive?: boolean
        /** Re-classify this category's past expenses too (default on the server: true). */
        applyToExisting?: boolean
      }
    >({
      query: ({ id, ...body }) => ({ url: `/expense-categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg?.transactionType) },
      ],
      // Only changes that rewrite saved expenses: a rename, a new type, a new ledger.
      onQueryStarted: (arg, api) =>
        arg.name !== undefined || arg.expenseNature !== undefined || arg.accountCode !== undefined
          ? refreshExpenseViewsAfter(arg, api)
          : undefined,
    }),
    deleteExpenseCategory: builder.mutation<
      { deleted: string; moved: { to: string; expenses: number; recurringRules: number } | null } | void,
      {
        id: string
        transactionType?: TransactionCategoryType
        /** Move the category's saved expenses + recurring rules to this category first. */
        moveTo?: string
      }
    >({
      query: ({ id, moveTo }) => ({
        url: `/expense-categories/${id}`,
        method: 'DELETE',
        params: moveTo ? { moveTo } : undefined,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ExpenseCategory', id: categoryTagId(arg.transactionType) },
        'ExpenseCategoryUsage',
      ],
      // Moving the expenses re-labels them; a plain delete leaves them untouched.
      onQueryStarted: (arg, api) => (arg.moveTo ? refreshExpenseViewsAfter(arg, api) : undefined),
    }),
    getExpenseCategoryUsage: builder.query<ExpenseCategoryUsage, void>({
      query: () => '/expense-categories/usage',
      providesTags: ['ExpenseCategoryUsage'],
      keepUnusedDataFor: 30,
    }),
    removeUnusedExpenseCategories: builder.mutation<
      { removed: string[]; kept: number },
      { onlyDefaults?: boolean; ids?: string[] }
    >({
      query: (body) => ({ url: '/expense-categories/remove-unused', method: 'POST', body }),
      invalidatesTags: [{ type: 'ExpenseCategory', id: 'business_expense' }, 'ExpenseCategoryUsage'],
    }),
  }),
})

export const {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  useGetExpenseCategoryUsageQuery,
  useRemoveUnusedExpenseCategoriesMutation,
} = expenseCategoryApi
