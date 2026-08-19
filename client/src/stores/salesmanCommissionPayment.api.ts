import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';
import { invalidateWalletCaches } from './wallet-cache-invalidation';

// A commission payment posts a Cash Book entry (and, when paid from a real wallet, a
// wallet entry) server-side — see `invalidateWalletCaches` for the full list of caches
// that would otherwise show a stale balance until an unrelated action refetches them.
const invalidateWalletsOnSettled = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled;
    invalidateWalletCaches(dispatch);
  } catch {
    // mutation failed — nothing to invalidate
  }
};

export interface SalesmanCommissionPayment {
  id: string;
  salesmanId: string;
  salesmanName?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateCommissionPaymentRequest {
  salesmanId: string;
  amount: number;
  paymentMethod?: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

// Ledger data lives in a separate API slice (salesmanCommissionLedger.api.ts) — callers
// refetch it explicitly on success rather than relying on cross-slice tag invalidation.
export const salesmanCommissionPaymentApi = createApi({
  reducerPath: 'salesmanCommissionPaymentApi',
  baseQuery,
  tagTypes: ['CommissionPayment'],
  endpoints: (builder) => ({
    createCommissionPayment: builder.mutation<SalesmanCommissionPayment, CreateCommissionPaymentRequest>({
      query: (body) => ({ url: '/commission-payments', method: 'POST', body }),
      invalidatesTags: ['CommissionPayment'],
      onQueryStarted: invalidateWalletsOnSettled,
    }),
    deleteCommissionPayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/commission-payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CommissionPayment'],
      onQueryStarted: invalidateWalletsOnSettled,
    }),
  }),
});

export const { useCreateCommissionPaymentMutation, useDeleteCommissionPaymentMutation } = salesmanCommissionPaymentApi;
