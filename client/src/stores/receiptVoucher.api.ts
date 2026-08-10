import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { invalidateWalletCaches } from './wallet-cache-invalidation'

/** A voucher moves a Bank Account's balance and posts Cash Book entries server-side, but
 *  receiptVoucherApi is a separate RTK Query slice from every cache that displays that —
 *  see `invalidateWalletCaches` for the full list and why each mutation has to invalidate
 *  them explicitly. Same cross-slice staleness fix as `paymentVoucher.api.ts`'s
 *  `invalidateWalletsAndCashBook` (itself following `expense.api.ts`'s
 *  `invalidateCashBook` pattern). */
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

export type ReceiptVoucherSourceType = 'customer' | 'income'

export interface ReceiptVoucherLine {
  id?: string
  sourceType: ReceiptVoucherSourceType
  category?: string
  customerId?: string
  customerName?: string
  payerName: string
  amount: number
  description?: string
  customerLedgerEntryId?: string
}

export interface ReceiptVoucherRecord {
  id: string
  voucherNumber: string
  date: string
  bankAccountId: string
  bankAccountName?: string
  lines: ReceiptVoucherLine[]
  totalAmount: number
  reference?: string
  notes?: string
  createdBy?: { id: string; name: string } | string
  createdAt: string
}

export interface CreateReceiptVoucherLine {
  sourceType: ReceiptVoucherSourceType
  category?: string
  customerId?: string
  amount: number
  description?: string
}

export interface CreateReceiptVoucherRequest {
  date?: string
  bankAccountId: string
  lines: CreateReceiptVoucherLine[]
  reference?: string
  notes?: string
}

export interface GetReceiptVouchersParams {
  bankAccountId?: string
  sourceType?: ReceiptVoucherSourceType
  search?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
  sortBy?: string
}

export const receiptVoucherApi = createApi({
  reducerPath: 'receiptVoucherApi',
  baseQuery,
  tagTypes: ['ReceiptVoucher'],
  endpoints: (builder) => ({
    getReceiptVouchers: builder.query<PaginatedResult<ReceiptVoucherRecord & { _id?: string }>, GetReceiptVouchersParams | void>({
      query: (params) => ({ url: '/receipt-vouchers', params: { limit: 20, ...params } }),
      transformResponse: (response: PaginatedResult<ReceiptVoucherRecord & { _id?: string }>) => ({
        ...response,
        results: (response.results || []).map((v) => ({
          ...v,
          id: v.id || (v._id != null ? String(v._id) : ''),
        })),
      }),
      providesTags: ['ReceiptVoucher'],
    }),
    getReceiptVoucher: builder.query<ReceiptVoucherRecord, string>({
      query: (id) => `/receipt-vouchers/${id}`,
      providesTags: ['ReceiptVoucher'],
    }),
    createReceiptVoucher: builder.mutation<ReceiptVoucherRecord, CreateReceiptVoucherRequest>({
      query: (body) => ({ url: '/receipt-vouchers', method: 'POST', body }),
      invalidatesTags: ['ReceiptVoucher'],
      onQueryStarted: invalidateWalletsAndCashBook,
    }),
    deleteReceiptVoucher: builder.mutation<void, string>({
      query: (id) => ({ url: `/receipt-vouchers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ReceiptVoucher'],
      onQueryStarted: invalidateWalletsAndCashBook,
    }),
  }),
})

export const {
  useGetReceiptVouchersQuery,
  useGetReceiptVoucherQuery,
  useCreateReceiptVoucherMutation,
  useDeleteReceiptVoucherMutation,
} = receiptVoucherApi
