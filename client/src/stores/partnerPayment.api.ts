import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

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
    }),
    deletePartnerPayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/partner-payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PartnerPayment'],
    }),
  }),
});

export const { useCreatePartnerPaymentMutation, useDeletePartnerPaymentMutation } = partnerPaymentApi;
