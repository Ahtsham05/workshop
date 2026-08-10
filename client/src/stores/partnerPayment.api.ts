import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';
import { invalidateWalletCaches } from './wallet-cache-invalidation';

// A partner payment posts a Cash Book entry (and, when paid from a real wallet, a wallet
// entry) server-side — see `invalidateWalletCaches` for the full list of caches that would
// otherwise show a stale balance until an unrelated action refetches them.
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

export interface PartnerPayment {
  id: string;
  partnerId: string;
  partnerName?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface CreatePartnerPaymentRequest {
  partnerId: string;
  amount: number;
  paymentMethod?: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

// Ledger data lives in a separate API slice (partnerProfitShareLedger.api.ts) — callers
// refetch it explicitly on success rather than relying on cross-slice tag invalidation.
export const partnerPaymentApi = createApi({
  reducerPath: 'partnerPaymentApi',
  baseQuery,
  tagTypes: ['PartnerPayment'],
  endpoints: (builder) => ({
    createPartnerPayment: builder.mutation<PartnerPayment, CreatePartnerPaymentRequest>({
      query: (body) => ({ url: '/partner-payments', method: 'POST', body }),
      invalidatesTags: ['PartnerPayment'],
      onQueryStarted: invalidateWalletsOnSettled,
    }),
    deletePartnerPayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/partner-payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PartnerPayment'],
      onQueryStarted: invalidateWalletsOnSettled,
    }),
  }),
});

export const { useCreatePartnerPaymentMutation, useDeletePartnerPaymentMutation } = partnerPaymentApi;
