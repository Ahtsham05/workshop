import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { invalidateWalletCaches } from './wallet-cache-invalidation'
import type { CreatedByRef } from '@/components/created-by-cell'

/** Paying an expense posts a cash-book entry (and, when paid from a real wallet, a wallet
 *  entry) server-side, but expenseApi is a separate RTK Query slice from every cache that
 *  displays that — see `invalidateWalletCaches` for the full list — so those pages would
 *  otherwise keep showing stale totals/balances until a full reload. */
const invalidateCashBook = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    invalidateWalletCaches(dispatch)
    await invalidateExpenseViews(dispatch)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

/**
 * Everything else that shows expense figures lives in other slices: category usage counts
 * (expenseCategoryApi) and the Expense / Profit & Loss reports (reportsApi). Imported lazily
 * — expenseCategory.api.ts imports this file back for the reverse direction.
 */
export const invalidateExpenseViews = async (dispatch: (action: unknown) => unknown) => {
  const [{ expenseCategoryApi }, { reportsApi }] = await Promise.all([
    import('./expenseCategory.api'),
    import('./reports.api'),
  ])
  dispatch(expenseCategoryApi.util.invalidateTags(['ExpenseCategoryUsage']))
  dispatch(reportsApi.util.invalidateTags(['ExpenseReport', 'ProfitLoss', 'ProfitLossFull']))
}

export interface ExpenseRecord {
  id: string
  expenseNumber?: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  walletType?: string
  vendor?: string
  date: string
  reference?: string
  referenceId?: string
  referenceModel?: string
  notes?: string
  isPaid: boolean
  paidAt?: string | null
  createdAt: string
  expenseNature?: 'direct' | 'indirect'
  voucherNumber?: string
  createdBy?: CreatedByRef
}

export interface ExpenseListArgs {
  page: number
  limit: number
  search?: string
  category?: string
  expenseNature?: 'direct' | 'indirect'
  voucherNumber?: string
  sortBy?: string
}

export interface ExpenseInput {
  category: string
  description: string
  amount: number
  paymentMethod?: string
  walletType?: string
  date?: string
  vendor?: string
  reference?: string
  notes?: string
}

export interface ExpenseVoucherLine {
  category: string
  description?: string
  vendor?: string
  reference?: string
  notes?: string
  amount: number
}

export interface ExpenseVoucherInput {
  /** YYYY-MM-DD — the business day; the server stamps the time. */
  date: string
  paymentMethod: string
  walletType?: string
  reference?: string
  notes?: string
  lines: ExpenseVoucherLine[]
}

export interface ExpenseVoucherResult {
  voucherNumber: string
  date: string
  paymentMethod: string
  walletType?: string
  total: number
  directAmount: number
  indirectAmount: number
  expenses: ExpenseRecord[]
}

export interface BulkExpenseImportResult {
  /** Rows with a category but no amount — only the category was kept. */
  categoryOnlyCount?: number
  insertedCount?: number
  skippedCount?: number
  totalAmount?: number
  directAmount?: number
  indirectAmount?: number
  createdCategories?: string[]
  errors?: Array<{ index?: number; error?: string; name?: string }>
  /** `categoryOnly`: a row with no amount — only its category was saved. */
  skipped?: Array<{ index?: number; reason: string; name?: string; categoryOnly?: boolean }>
  warnings?: Array<{ index?: number; message: string; name?: string }>
}

export interface PayBulkResult {
  matched: number
  paidCount: number
  totalAmount: number
  errors: { id: string; message: string }[]
}

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const expenseApi = createApi({
  reducerPath: 'expenseApi',
  baseQuery,
  tagTypes: ['Expenses'],
  endpoints: (builder) => ({
    /**
     * The Expense List page. Cached per filter set: going to Add Expense and back, or
     * re-selecting a filter, is served from cache; any expense change (here, Recurring's
     * Pay, imports, vouchers) invalidates 'Expenses' and refreshes it once.
     */
    getExpenses: builder.query<PaginatedResult<ExpenseRecord>, ExpenseListArgs>({
      query: ({ search, category, expenseNature, voucherNumber, ...rest }) => ({
        url: '/expenses',
        params: {
          sortBy: 'date:desc',
          ...rest,
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
          ...(expenseNature ? { expenseNature } : {}),
          ...(voucherNumber ? { voucherNumber } : {}),
        },
      }),
      providesTags: ['Expenses'],
      keepUnusedDataFor: 120,
    }),
    createExpense: builder.mutation<ExpenseRecord, ExpenseInput>({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
    updateExpense: builder.mutation<ExpenseRecord, { id: string } & Partial<ExpenseInput>>({
      query: ({ id, ...body }) => ({ url: `/expenses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
    deleteExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/expenses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
    createExpenseVoucher: builder.mutation<ExpenseVoucherResult, ExpenseVoucherInput>({
      query: (body) => ({ url: '/expenses/voucher', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
    /** One batch of an Excel import. Tags are NOT invalidated per batch (a 2,000-row file
     *  would refetch the list 20 times) — the dialog calls invalidateAfterImport once. */
    importExpensesBatch: builder.mutation<
      BulkExpenseImportResult,
      { expenses: unknown[]; duplicateStrategy: string; paymentStatus: string; createMissingCategories: boolean }
    >({
      query: (body) => ({ url: '/expenses/bulk', method: 'POST', body }),
    }),
    /** Unpaid expenses generated by a specific recurring rule (or org-wide if no referenceId given) — used to list individual items before bulk/single pay. */
    getPendingExpenses: builder.query<PaginatedResult<ExpenseRecord>, { referenceId?: string } | void>({
      query: (params) => ({
        url: '/expenses',
        params: {
          isPaid: false,
          referenceModel: 'RecurringExpense',
          sortBy: 'date:asc',
          limit: 200,
          ...(params?.referenceId ? { referenceId: params.referenceId } : {}),
        },
      }),
      providesTags: ['Expenses'],
    }),
    payExpense: builder.mutation<ExpenseRecord, string>({
      query: (expenseId) => ({ url: `/expenses/${expenseId}/pay`, method: 'PATCH' }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
    payExpensesBulk: builder.mutation<PayBulkResult, { referenceId?: string; category?: string; all?: boolean }>({
      query: (body) => ({ url: '/expenses/pay-bulk', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
      onQueryStarted: invalidateCashBook,
    }),
  }),
})

/** After a whole import finishes: refresh every expense view once. */
export const invalidateAfterImport = async (dispatch: (action: unknown) => unknown) => {
  dispatch(expenseApi.util.invalidateTags(['Expenses']))
  invalidateWalletCaches(dispatch)
  await invalidateExpenseViews(dispatch)
}

export const {
  useGetExpensesQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useCreateExpenseVoucherMutation,
  useImportExpensesBatchMutation,
  useGetPendingExpensesQuery,
  usePayExpenseMutation,
  usePayExpensesBulkMutation,
} = expenseApi
