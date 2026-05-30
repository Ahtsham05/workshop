import { useCallback, useMemo } from 'react'
import {
  expenseCategoryApi,
  useGetExpenseCategoriesQuery,
  type ExpenseCategory,
  type TransactionCategoryType,
} from '@/stores/expenseCategory.api'
import { useDispatch } from 'react-redux'

/** Transaction types used by My Wallet (personal ledger) */
export const WALLET_LEDGER_CATEGORY_TYPES: TransactionCategoryType[] = [
  'income',
  'expense',
  'transfer',
  'opening_balance',
  'adjustment',
]

export const EMPTY_WALLET_CATEGORY_CATALOG: Record<TransactionCategoryType, ExpenseCategory[]> = {
  income: [],
  expense: [],
  transfer: [],
  opening_balance: [],
  adjustment: [],
  business_expense: [],
}

/** Cache wallet categories for 5 minutes; avoid refetch storms when the form opens */
const WALLET_CATEGORY_QUERY_OPTIONS = {
  refetchOnMountOrArgChange: false,
  refetchOnFocus: false,
  refetchOnReconnect: false,
} as const

/**
 * Single source of truth for My Wallet category lists (one fetch per transaction type per session).
 */
export function useWalletLedgerCategoryCatalog() {
  const dispatch = useDispatch()

  const income = useGetExpenseCategoriesQuery(
    { transactionType: 'income' },
    WALLET_CATEGORY_QUERY_OPTIONS,
  )
  const expense = useGetExpenseCategoriesQuery(
    { transactionType: 'expense' },
    WALLET_CATEGORY_QUERY_OPTIONS,
  )
  const transfer = useGetExpenseCategoriesQuery(
    { transactionType: 'transfer' },
    WALLET_CATEGORY_QUERY_OPTIONS,
  )
  const openingBalance = useGetExpenseCategoriesQuery(
    { transactionType: 'opening_balance' },
    WALLET_CATEGORY_QUERY_OPTIONS,
  )
  const adjustment = useGetExpenseCategoriesQuery(
    { transactionType: 'adjustment' },
    WALLET_CATEGORY_QUERY_OPTIONS,
  )

  const byType = useMemo(
    (): Record<TransactionCategoryType, ExpenseCategory[]> => ({
      ...EMPTY_WALLET_CATEGORY_CATALOG,
      income: income.data ?? [],
      expense: expense.data ?? [],
      transfer: transfer.data ?? [],
      opening_balance: openingBalance.data ?? [],
      adjustment: adjustment.data ?? [],
    }),
    [
      income.data,
      expense.data,
      transfer.data,
      openingBalance.data,
      adjustment.data,
    ],
  )

  const isLoading =
    income.isLoading ||
    expense.isLoading ||
    transfer.isLoading ||
    openingBalance.isLoading ||
    adjustment.isLoading

  const refreshType = useCallback(
    (transactionType: TransactionCategoryType) => {
      dispatch(
        expenseCategoryApi.util.invalidateTags([
          { type: 'ExpenseCategory', id: transactionType },
        ]),
      )
    },
    [dispatch],
  )

  const refetchAll = useCallback(() => {
    WALLET_LEDGER_CATEGORY_TYPES.forEach((type) => refreshType(type))
  }, [refreshType])

  return { byType, isLoading, refreshType, refetchAll }
}
