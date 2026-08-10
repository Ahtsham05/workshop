import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { invalidateWalletCaches } from './wallet-cache-invalidation'

/** A voucher moves a Bank Account's balance and posts Cash Book entries server-side, but
 *  paymentVoucherApi is a separate RTK Query slice from every cache that displays that —
 *  see `invalidateWalletCaches` for the full list and why each mutation has to invalidate
 *  them explicitly. Without this, the Bank Accounts page, Cash Book, Bank Account
 *  Statement, and Bank Reconciliation can each show a different picture until an unrelated
 *  action happens to refetch them. */
const invalidateWalletsAndCashBook = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    invalidateWalletCaches(dispatch)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export type PaymentVoucherPayeeType = 'expense' | 'supplier' | 'other'

export interface PaymentVoucherLine {
  id?: string
  payeeType: PaymentVoucherPayeeType
  category?: string
  supplierId?: string
  supplierName?: string
  payeeName: string
  amount: number
  description?: string
  expenseId?: string
  supplierLedgerEntryId?: string
}

export interface PaymentVoucherRecord {
  id: string
  voucherNumber: string
  date: string
  bankAccountId: string
  bankAccountName?: string
  lines: PaymentVoucherLine[]
  totalAmount: number
  reference?: string
  notes?: string
  createdBy?: { id: string; name: string } | string
  createdAt: string
}

export interface CreatePaymentVoucherLine {
  payeeType: PaymentVoucherPayeeType
  category?: string
  supplierId?: string
  payeeName?: string
  amount: number
  description?: string
}

export interface CreatePaymentVoucherRequest {
  date?: string
  bankAccountId: string
  lines: CreatePaymentVoucherLine[]
  reference?: string
  notes?: string
}

export interface GetPaymentVouchersParams {
  bankAccountId?: string
  payeeType?: PaymentVoucherPayeeType
  search?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
  sortBy?: string
}

export const paymentVoucherApi = createApi({
  reducerPath: 'paymentVoucherApi',
  baseQuery,
  tagTypes: ['PaymentVoucher'],
  endpoints: (builder) => ({
    getPaymentVouchers: builder.query<PaginatedResult<PaymentVoucherRecord & { _id?: string }>, GetPaymentVouchersParams | void>({
      query: (params) => ({ url: '/payment-vouchers', params: { limit: 20, ...params } }),
      transformResponse: (response: PaginatedResult<PaymentVoucherRecord & { _id?: string }>) => ({
        ...response,
        results: (response.results || []).map((v) => ({
          ...v,
          id: v.id || (v._id != null ? String(v._id) : ''),
        })),
      }),
      providesTags: ['PaymentVoucher'],
    }),
    getPaymentVoucher: builder.query<PaymentVoucherRecord, string>({
      query: (id) => `/payment-vouchers/${id}`,
      providesTags: ['PaymentVoucher'],
    }),
    createPaymentVoucher: builder.mutation<PaymentVoucherRecord, CreatePaymentVoucherRequest>({
      query: (body) => ({ url: '/payment-vouchers', method: 'POST', body }),
      invalidatesTags: ['PaymentVoucher'],
      onQueryStarted: invalidateWalletsAndCashBook,
    }),
    deletePaymentVoucher: builder.mutation<void, string>({
      query: (id) => ({ url: `/payment-vouchers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentVoucher'],
      onQueryStarted: invalidateWalletsAndCashBook,
    }),
  }),
})

export const {
  useGetPaymentVouchersQuery,
  useGetPaymentVoucherQuery,
  useCreatePaymentVoucherMutation,
  useDeletePaymentVoucherMutation,
} = paymentVoucherApi
